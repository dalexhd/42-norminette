import {
	workspace,
	ExtensionContext,
	window,
	languages,
	commands,
	Uri,
	TreeDataProvider,
	TreeItem,
	TreeItemCollapsibleState
  } from "vscode";

export class norminetteErrorsView {
	constructor(context: ExtensionContext) {
		const view = window.createTreeView('norminetteErrorsView', { treeDataProvider: generateTreeView(), showCollapseAll: true });
		context.subscriptions.push(view);
	}
}

const nodes = {};
let errors = {};

function generateTreeView(): TreeDataProvider<{ key: string }> {
	const editor = window.activeTextEditor;
	if (!editor) return;
	const diagnostics = languages.getDiagnostics(editor.document.uri);
	if (!diagnostics) return;
	errors = {};
	diagnostics.forEach((diagnostic) => {
		if (typeof errors[diagnostic.code as string] === "undefined") {
			// @ts-expect-error:
			errors[diagnostic.code.value as string] = diagnostic;
		}
	})
	return {
		getChildren: (element: { key: string }): { key: string }[] => {
			return getChildren(element ? element.key : undefined).map(key => getNode(key));
		},
		getTreeItem: (element: { key: string }): TreeItem => {
			const treeItem = getTreeItem(element.key);
			treeItem.id = element.key;
			return treeItem;
		},
		getParent: ({ key }: { key: string }): { key: string } => {
			const parentKey = key.substring(0, key.length - 1);
			return parentKey ? new Key(parentKey) : void 0;
		}
	};
}

function getChildren(key: string): string[] {
	if (!key) {
		return Object.keys(errors);
	}
	const treeElement = getTreeElement(key);
	if (treeElement) {
		return Object.keys(treeElement);
	}
	return [];
}

function getTreeItem(key: string): TreeItem {
	const treeElement = getTreeElement(key);
	return {
		label: /**vscode.TreeItemLabel**/<any>{ label: key, highlights: key.length > 1 ? [[key.length - 2, key.length - 1]] : void 0},
		tooltip: `Tooltip for ${key}`,
		collapsibleState: treeElement && Object.keys(treeElement).length ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
	};
}

function getTreeElement(element): any {
	let parent = errors;
	for (let i = 0; i < element.length; i++) {
		parent = parent[element.substring(0, i + 1)];
		if (!parent) {
			return null;
		}
	}
	return parent;
}

function getNode(key: string): { key: string } {
	if (!nodes[key]) {
		nodes[key] = new Key(key);
	}
	return nodes[key];
}

class Key {
	constructor(readonly key: string) { }
}