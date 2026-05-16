import * as vscode from 'vscode';
import { ModelInfo, ToolId } from '../types';

type ModelsResponse = {
  data?: Array<{
    id?: unknown;
    display_name?: unknown;
    object?: unknown;
  }>;
};

export class ModelFetchError extends Error {
  constructor(message: string, readonly causeText?: string) {
    super(message);
  }
}

export async function fetchModels(tool: ToolId, baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  const candidates = buildModelUrls(baseUrl);
  const errors: string[] = [];

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(tool, apiKey)
      });

      if (!response.ok) {
        errors.push(`${url}: HTTP ${response.status}`);
        continue;
      }

      const json = (await response.json()) as ModelsResponse;
      const models = normalizeModels(tool, json);
      if (models.length > 0) {
        return sortModels(tool, models);
      }
      errors.push(`${url}: empty model list`);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new ModelFetchError('Unable to fetch model list', errors.join('; '));
}

export function buildModelUrls(baseUrl: string): string[] {
  const normalized = baseUrl.trim().replace(/\/+$/g, '');
  if (!normalized) {
    return [];
  }
  if (normalized.endsWith('/v1')) {
    return [`${normalized}/models`, `${normalized.slice(0, -3)}/models`];
  }
  return [`${normalized}/v1/models`, `${normalized}/models`];
}

function buildHeaders(tool: ToolId, apiKey: string): Record<string, string> {
  if (tool === 'claude') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': vscode.workspace
        .getConfiguration('vsmodelswitch')
        .get<string>('anthropicVersion', '2023-06-01')
    };
  }

  return {
    authorization: `Bearer ${apiKey}`
  };
}

function normalizeModels(tool: ToolId, json: ModelsResponse): ModelInfo[] {
  if (!Array.isArray(json.data)) {
    return [];
  }

  const seen = new Set<string>();
  const models: ModelInfo[] = [];
  for (const item of json.data) {
    if (typeof item.id !== 'string' || !item.id.trim()) {
      continue;
    }
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    models.push({
      id: item.id,
      displayName: typeof item.display_name === 'string' ? item.display_name : undefined,
      source: tool
    });
  }
  return models;
}

export function sortModels(tool: ToolId, models: ModelInfo[]): ModelInfo[] {
  return [...models].sort((a, b) => {
    const scoreDiff = scoreModel(tool, b.id) - scoreModel(tool, a.id);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return b.id.localeCompare(a.id);
  });
}

function scoreModel(tool: ToolId, model: string): number {
  const id = model.toLowerCase();
  if (tool === 'claude') {
    if (id.includes('sonnet')) {
      return 100;
    }
    if (id.includes('opus')) {
      return 90;
    }
    if (id.includes('haiku')) {
      return 70;
    }
    if (id.includes('claude')) {
      return 60;
    }
    return 10;
  }

  if (id.includes('codex')) {
    return 110;
  }
  if (id.includes('gpt-5')) {
    return 100;
  }
  if (id.includes('gpt-4')) {
    return 80;
  }
  if (id.includes('reason') || id.includes('thinking') || id.includes('r1')) {
    return 70;
  }
  return 10;
}
