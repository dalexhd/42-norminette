"use strict";

import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  InitializeResult,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
} from "vscode-languageserver/node";

import docsErrors from "./errors";

import { upperFirst, trimStart, kebabCase } from "lodash";

import config from "./config";

import { TextDocument } from "vscode-languageserver-textdocument";

import { URI } from "vscode-uri";

import { runNorminetteProccess, quickfix } from "./utils";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;
let hasCodeActionLiteralsCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
  let capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  hasCodeActionLiteralsCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.codeAction &&
    capabilities.textDocument.codeAction.codeActionLiteralSupport
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  if (hasCodeActionLiteralsCapability) {
    result.capabilities.codeActionProvider = {
      codeActionKinds: [CodeActionKind.QuickFix],
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
  if (hasCodeActionLiteralsCapability) {
    connection.onCodeAction(
      async (parms: CodeActionParams): Promise<CodeAction[]> => {
        if (!parms.context.diagnostics.length) {
          return [];
        }
        const document = documents.get(parms.textDocument.uri);
        if (!document) return [];
        return quickfix(document, parms);
      }
    );
  }
});

// The example settings
interface Settings {
  command: string;
  showErrors: string;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: Settings = { command: "norminette", showErrors: "all" };
let globalSettings: Settings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<Settings>> = new Map();

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <Settings>(
      (change.settings["42norminette"] || defaultSettings)
    );
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<Settings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: "42norminette",
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  let problems = 0;
  let diagnostics: Diagnostic[] = [];
  const path = URI.parse(textDocument.uri).path;
  const { showErrors, command } = await getDocumentSettings(path);
  runNorminetteProccess(`${command} ${path}`)
    .then((errors) => {
      errors.forEach(({ line, col, id, error }, index) => {
        const range = {
          start: {
            line,
            character: col,
          },
          end: {
            line,
            character: col,
          },
        };
        let diagnostic: Diagnostic = {
          severity: DiagnosticSeverity.Error,
          range,
          message: upperFirst(trimStart(error)),
          code: id,
          source: "norminette",
          codeDescription: {
            href: docsErrors.includes(id)
              ? config.docsUrl + "/docs/errors/" + kebabCase(id)
              : "https://github.com/dalexhd/42-norminette/compare",
          },
        };
        //TODO: Add norminette error descriptions and display them at 'relatedInformation
        if (hasDiagnosticRelatedInformationCapability) {
          diagnostic.relatedInformation = [
            {
              location: {
                uri: textDocument.uri,
                range: Object.assign({}, diagnostic.range),
              },
              message: upperFirst(trimStart(error)),
            },
          ];
        }
        if ((index === 0 && showErrors === "one") || showErrors === "all") {
          diagnostics.push(diagnostic);
        }
      });
      // Send the computed diagnostics to VSCode.
      connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    })
    .catch((err) => {
      connection.sendNotification("error", err?.message);
    });
}

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  connection.console.log("We received an file change event");
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
