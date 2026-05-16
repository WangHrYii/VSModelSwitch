import * as vscode from 'vscode';

export class SecretStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async get(secretRef: string): Promise<string | undefined> {
    return this.secrets.get(secretRef);
  }

  async store(secretRef: string, value: string): Promise<void> {
    await this.secrets.store(secretRef, value);
  }

  async delete(secretRef: string): Promise<void> {
    await this.secrets.delete(secretRef);
  }

  static ref(providerId: string, tool: 'claude' | 'codex'): string {
    return `vsmodelswitch.provider.${providerId}.${tool}.key`;
  }
}
