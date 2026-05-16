import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export function getEffectiveHome(): string {
  const configuration = vscode.workspace.getConfiguration('vsmodelswitch');
  const target = configuration.get<string>('configTarget', 'real');
  if (target === 'real') {
    return os.homedir();
  }

  const configured = configuration
    .get<string>('testHome', '')
    .trim();
  return configured || defaultSandboxHome();
}

export function resolveHomePath(...segments: string[]): string {
  return path.join(getEffectiveHome(), ...segments);
}

function defaultSandboxHome(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceFolder) {
    return path.join(workspaceFolder, '.vsmodelswitch-home');
  }
  return path.join(os.homedir(), '.vsmodelswitch-home');
}
