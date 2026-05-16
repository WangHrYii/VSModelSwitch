import * as vscode from 'vscode';
import { VSModelSwitchApp } from './app';

let app: VSModelSwitchApp | undefined;

export function activate(context: vscode.ExtensionContext): void {
  app = new VSModelSwitchApp(context);
  context.subscriptions.push(app);
}

export function deactivate(): void {
  app?.dispose();
  app = undefined;
}
