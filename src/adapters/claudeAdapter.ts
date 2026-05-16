import { backupFile } from '../config/atomicWrite';
import { readJsonObject, writeJsonObject } from '../config/jsonFile';
import { ResolvedProvider } from '../types';
import { resolveHomePath } from '../utils/paths';

export class ClaudeAdapter {
  async apply(resolved: ResolvedProvider): Promise<void> {
    if (!resolved.claude) {
      return;
    }

    const settingsPath = resolveHomePath('.claude', 'settings.json');
    const settings = await readJsonObject(settingsPath);
    const env = normalizeObject(settings.env);

    env.ANTHROPIC_BASE_URL = resolved.claude.baseUrl;
    env.ANTHROPIC_AUTH_TOKEN = resolved.claude.key;
    settings.env = env;

    if (resolved.claude.model) {
      settings.model = resolved.claude.model;
    }

    await backupFile(settingsPath);
    await writeJsonObject(settingsPath, settings);
  }

  getConfigPath(): string {
    return resolveHomePath('.claude', 'settings.json');
  }

  async readActiveConfig(): Promise<{ baseUrl?: string; model?: string }> {
    const settings = await readJsonObject(this.getConfigPath());
    const env = normalizeObject(settings.env);
    return {
      baseUrl: typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : undefined,
      model: typeof settings.model === 'string' ? settings.model : undefined
    };
  }
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}
