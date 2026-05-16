import { ModelInfo, ModelPolicy, ProviderProfile, ToolEndpointConfig, ToolId } from '../types';
import { fingerprintSecret } from '../utils/hash';
import { fetchModels } from './modelFetcher';
import { ProviderStore } from '../storage/providerStore';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export class ModelResolver {
  constructor(private readonly store: ProviderStore) {}

  async refresh(tool: ToolId, config: ToolEndpointConfig | ProviderProfile, key: string): Promise<ModelInfo[]> {
    const models = await fetchModels(tool, config.baseUrl, key);
    await this.store.saveModelCache({
      tool,
      baseUrl: config.baseUrl,
      keyFingerprint: fingerprintSecret(key),
      fetchedAt: new Date().toISOString(),
      ttlMs: DEFAULT_TTL_MS,
      models
    });
    return models;
  }

  async resolve(tool: ToolId, config: ToolEndpointConfig | ProviderProfile, key: string): Promise<string | undefined> {
    const policy = config.modelPolicy;
    if (policy.type === 'toolDefault') {
      return undefined;
    }
    if (policy.type === 'fixed' || policy.type === 'custom') {
      return policy.model;
    }
    if (policy.preferred) {
      return policy.preferred;
    }

    const cache = this.store.findModelCache(tool, config.baseUrl, fingerprintSecret(key));
    if (cache?.models.length) {
      return cache.models[0].id;
    }

    const models = await this.refresh(tool, config, key);
    return models[0]?.id;
  }

  bestAutoPolicy(models: ModelInfo[], fallback: ModelPolicy): ModelPolicy {
    if (models.length === 0) {
      return fallback;
    }
    return {
      type: 'providerAuto',
      preferred: models[0].id
    };
  }
}
