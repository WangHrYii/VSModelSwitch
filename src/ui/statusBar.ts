import * as vscode from 'vscode';
import { ToolRuntimeState } from '../types';

export class StatusBarController implements vscode.Disposable {
  private readonly claudeItem: vscode.StatusBarItem;
  private readonly codexItem: vscode.StatusBarItem;

  constructor() {
    this.claudeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 51);
    this.codexItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.claudeItem.command = 'vsmodelswitch.openMenu';
    this.codexItem.command = 'vsmodelswitch.openMenu';
    this.claudeItem.show();
    this.codexItem.show();
  }

  update(states: { claude: ToolRuntimeState; codex: ToolRuntimeState }): void {
    this.updateItem(this.claudeItem, 'Claude', states.claude);
    this.updateItem(this.codexItem, 'Codex', states.codex);
  }

  dispose(): void {
    this.claudeItem.dispose();
    this.codexItem.dispose();
  }

  private updateItem(item: vscode.StatusBarItem, label: string, state: ToolRuntimeState): void {
    const provider = state.providerName ?? shortUrl(state.baseUrl) ?? 'Off';
    const model = state.model ?? 'model unknown';
    item.text = `$(plug) ${label}: ${provider} / ${model}`;
    item.tooltip = [
      `VSModelSwitch ${label}`,
      `Provider: ${provider}`,
      `Model: ${model}`,
      state.baseUrl ? `URL: ${state.baseUrl}` : undefined,
      `Config: ${state.configPath}`,
      state.matchedProviderId ? 'Source: matched saved provider' : 'Source: config file'
    ]
      .filter(Boolean)
      .join('\n');
  }
}

function shortUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}
