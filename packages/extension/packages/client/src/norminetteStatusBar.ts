/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/


import {
	StatusBarItem,
	window,
	StatusBarAlignment,
	ExtensionContext,
	languages
} from 'vscode';

let myStatusBarItem: StatusBarItem;

export class norminetteStatusBar {
	constructor(context: ExtensionContext) {
	// register a command that is invoked when the status bar
		// item is selected
		// create a new status bar item that we can now manage
		myStatusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100);
		myStatusBarItem.command = "workbench.action.problems.focus";
		context.subscriptions.push(myStatusBarItem);

		// register some listener that make sure the status bar 
		// item always up-to-date
		languages.onDidChangeDiagnostics(() => {
			updateStatusBarItem();
		});
	}
}

function updateStatusBarItem(): void {
	const editor = window.activeTextEditor;
	if (!editor) return;
	const diagnostics = languages.getDiagnostics(editor.document.uri);
	if (!diagnostics) return;
	if (diagnostics.length > 0) {
		myStatusBarItem.text = `$(octoface) ${diagnostics.length} Norm issues!`;
		myStatusBarItem.show();
	} else {
		myStatusBarItem.hide();
	}
}