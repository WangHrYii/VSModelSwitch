import * as vscode from 'vscode';

export class TerminalManager {
  openClaude(env: Record<string, string>): void {
    this.open('Claude Code', 'claude', env);
  }

  openCodex(env: Record<string, string>): void {
    this.open('Codex', 'codex', env);
  }

  private open(name: string, command: string, env: Record<string, string>): void {
    const terminal = vscode.window.createTerminal({
      name,
      env
    });
    terminal.show();
    terminal.sendText(command);
  }
}
