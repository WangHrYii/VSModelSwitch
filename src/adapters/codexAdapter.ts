import * as fs from 'fs/promises';
import { atomicWrite, backupFile, pathExists } from '../config/atomicWrite';
import { getTopLevelStringValue, setSectionValue, setTopLevelValue } from '../config/tomlEdit';
import { ResolvedProvider } from '../types';
import { resolveHomePath } from '../utils/paths';

export class CodexAdapter {
  async apply(resolved: ResolvedProvider): Promise<void> {
    if (!resolved.codex) {
      return;
    }

    const configPath = resolveHomePath('.codex', 'config.toml');
    let content = (await pathExists(configPath)) ? await fs.readFile(configPath, 'utf8') : '';
    const providerId = resolved.codex.codexProviderId;
    const section = `model_providers.${providerId}`;

    content = setTopLevelValue(content, 'model_provider', providerId);
    if (resolved.codex.model) {
      content = setTopLevelValue(content, 'model', resolved.codex.model);
    }
    content = setSectionValue(content, section, 'name', resolved.codex.providerName);
    content = setSectionValue(content, section, 'wire_api', resolved.codex.wireApi);
    content = setSectionValue(content, section, 'requires_openai_auth', true);
    content = setSectionValue(content, section, 'base_url', resolved.codex.baseUrl);

    await backupFile(configPath);
    await atomicWrite(configPath, content);
  }

  getConfigPath(): string {
    return resolveHomePath('.codex', 'config.toml');
  }

  async readActiveConfig(): Promise<{ baseUrl?: string; model?: string; providerId?: string }> {
    const configPath = this.getConfigPath();
    if (!(await pathExists(configPath))) {
      return {};
    }

    const content = await fs.readFile(configPath, 'utf8');
    const providerId = getTopLevelStringValue(content, 'model_provider');
    const model = getTopLevelStringValue(content, 'model');
    const baseUrl = providerId ? getSectionStringValue(content, `model_providers.${providerId}`, 'base_url') : undefined;
    return {
      providerId,
      model,
      baseUrl
    };
  }
}

function getSectionStringValue(content: string, section: string, key: string): string | undefined {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const sectionPattern = new RegExp(`^\\s*\\[${escapeRegExp(section)}\\]\\s*$`);
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.+?)\\s*$`);
  const sectionStart = lines.findIndex((line) => sectionPattern.test(line));
  if (sectionStart < 0) {
    return undefined;
  }

  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
      return undefined;
    }
    const match = lines[index].match(keyPattern);
    if (match) {
      return parseTomlString(match[1]);
    }
  }
  return undefined;
}

function parseTomlString(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed || undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
