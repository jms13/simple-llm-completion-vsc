import * as vscode from 'vscode';
import { State } from './state';

export function activate(context: vscode.ExtensionContext) {
	var state = State.getInstance(context);

	const completionProvider = vscode.languages.registerInlineCompletionItemProvider(
		{ pattern: '**' },
		state.completion
	);
	context.subscriptions.push(completionProvider);

	const triggerCompletion = vscode.commands.registerCommand('simpleLlmCompletion.triggerCompletion', () => {
		// Manual triggering of the completion.
		if (!vscode.window.activeTextEditor) {
			vscode.window.showErrorMessage('No active editor!');
			return;
		}
		vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
	});
	context.subscriptions.push(triggerCompletion);

	let configurationChange = vscode.workspace.onDidChangeConfiguration((event) => {
		state.onConfigurationChange();
    });
    context.subscriptions.push(configurationChange);
}

export function deactivate() { }
