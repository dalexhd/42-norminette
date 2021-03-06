import * as path from "path";
import {
  workspace,
  ExtensionContext,
  window,
  languages,
  commands,
  Uri,
} from "vscode";
import errorGutter from "./error-gutters";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

// import { norminetteErrorsView } from './norminetteErrorsView';
import { norminetteStatusBar } from './norminetteStatusBar';


let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // The server is implemented in node
  let serverModule = context.asAbsolutePath(
    path.join("packages", "server", "out", "server.js")
  );

  context.subscriptions.push(
    languages.onDidChangeDiagnostics(() => {
      errorGutter();
        // Test View
	    // new norminetteErrorsView(context); // Disable for now
    }),
    commands.registerCommand("42-norminette.searchOnStackOverflow", (text) => {
      const languageId = window.activeTextEditor.document.languageId;
      const url = `https://stackoverflow.com/search?q=[${languageId}]${text}`;
      commands.executeCommand("vscode.open", Uri.parse(url));
    }),
    
    commands.registerCommand("42-norminette.searchOnNorminette", (url) => {
      commands.executeCommand("vscode.open", url);
    })
  );
  new norminetteStatusBar(context);
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  let debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  let serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents,
    documentSelector: [
      { scheme: "file", language: "c" },
      { scheme: "file", language: "cpp" },
    ],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "42norminette",
    "42 Norminette",
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start();

  client.onReady().then(() => {
    client.onNotification("error", (error: string) => {
      window.showErrorMessage(error);
    });
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
