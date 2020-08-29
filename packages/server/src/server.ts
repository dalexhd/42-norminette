'use strict';

import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	Position,
} from 'vscode-languageserver';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { exec } from 'child_process';
import { uriToFilePath } from 'vscode-languageserver/lib/files';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

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

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true,
			},
		},
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true,
			},
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders((_event) => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface Settings {
	command: string;
	maxErrors: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: Settings = { command: '~/.norminette/norminette.rb', maxErrors: 1 };
let globalSettings: Settings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<Settings>> = new Map();

connection.onDidChangeConfiguration((change) => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <Settings>(change.settings['42norminette'] || defaultSettings);
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
			section: '42norminette',
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

interface NormResult {
	line: number;
	col: number;
	fullText: string;
	errorText: string;
}

const normDecrypt = function (normLine: string): object {
	let line, col;
	const array = normLine.split(':')[0].match(/[0-9]+/g);
	if (array) [line, col] = array.map((e) => +e);
	const ob: NormResult = {
		line: (line as number) < 0 ? 0 : (line as number) - 1 || 0,
		col: col as number,
		fullText: normLine,
		errorText: normLine.split(':')[1],
	};
	return ob;
};

const runNorminetteProccess = async function (path: string): Promise<Array<NormResult>> {
	let { command } = await getDocumentSettings(path);
	return new Promise((resolve, reject) => {
		const line: string[] = [];
		const normDecrypted: any[] = [];
		const proc = exec(`${command} ${path}`, function (error, stdout, stderr) {
			if (error) return connection.sendNotification('error', error.message);
			stdout.split('\n').forEach((text: string, index: number) => {
				if (index == 0) return;
				line.push(text);
			});
		});
		proc.on('close', (exitCode) => {
			try {
				line.pop();
				line.forEach((e) => {
					normDecrypted.push(normDecrypt(e));
				});
				resolve(normDecrypted);
			} catch (e) {
				console.log(e);
			}
		});
	});
};

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	let problems = 0;
	let diagnostics: Diagnostic[] = [];
	const document = uriToFilePath(textDocument.uri) as string;
	const { maxErrors } = await getDocumentSettings(document);
	runNorminetteProccess(document).then((errors) => {
		errors.forEach(({ errorText, line, col, fullText }) => {
			const range = col
				? {
						start: {
							line,
							character: col,
						},
						end: {
							line,
							character: col,
						},
				  }
				: {
						start: {
							line,
							character: 0,
						},
						end: {
							line,
							character: 0,
						},
				  };
			let diagnostic: Diagnostic = {
				severity: DiagnosticSeverity.Warning,
				range,
				message: 'Norm error:' + errorText,
				source: 'ex',
			};
			if (hasDiagnosticRelatedInformationCapability) {
				diagnostic.relatedInformation = [
					{
						location: {
							uri: textDocument.uri,
							range: Object.assign({}, diagnostic.range),
						},
						message: 'Spelling matters',
					},
				];
			}
			if (problems < maxErrors) {
				problems++;
				diagnostics.push(diagnostic);
			}
		});
		// Send the computed diagnostics to VSCode.
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
	});
}

connection.onDidChangeWatchedFiles((_change) => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
