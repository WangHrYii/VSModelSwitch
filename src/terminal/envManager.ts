import * as vscode from 'vscode';
import { ResolvedProvider } from '../types';

export class EnvManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  apply(resolved: ResolvedProvider): Record<string, string> {
    const collection = this.context.environmentVariableCollection;
    collection.persistent = false;

    this.clear();

    const env: Record<string, string> = {};
    if (resolved.claude) {
      env.ANTHROPIC_BASE_URL = resolved.claude.baseUrl;
      env.ANTHROPIC_AUTH_TOKEN = resolved.claude.key;
    }
    if (resolved.codex) {
      env.OPENAI_BASE_URL = resolved.codex.baseUrl;
      env.OPENAI_API_KEY = resolved.codex.key;
    }

    for (const [key, value] of Object.entries(env)) {
      collection.replace(key, value);
    }

    return env;
  }

  clear(): void {
    const collection = this.context.environmentVariableCollection;
    for (const key of ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_BASE_URL', 'OPENAI_API_KEY']) {
      collection.delete(key);
    }
  }
}
