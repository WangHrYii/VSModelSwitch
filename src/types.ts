export type ToolId = 'claude' | 'codex';

export type ModelPolicy =
  | { type: 'toolDefault' }
  | { type: 'providerAuto'; preferred?: string }
  | { type: 'fixed'; model: string }
  | { type: 'custom'; model: string };

export interface ToolEndpointConfig {
  baseUrl: string;
  modelPolicy: ModelPolicy;
  secretRef: string;
}

export interface CodexEndpointConfig {
  providerId: string;
  wireApi: 'responses' | 'chat';
}

export interface ProviderProfile {
  id: string;
  name: string;
  tool: ToolId;
  baseUrl: string;
  modelPolicy: ModelPolicy;
  secretRef: string;
  codex?: CodexEndpointConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ModelInfo {
  id: string;
  displayName?: string;
  source: ToolId;
}

export interface ModelCacheEntry {
  tool: ToolId;
  baseUrl: string;
  keyFingerprint: string;
  fetchedAt: string;
  ttlMs: number;
  models: ModelInfo[];
  error?: string;
}

export interface PublicConfigFile {
  version: 1;
  currentProviderIds?: Partial<Record<ToolId, string>>;
  providers: ProviderProfile[];
}

export interface ResolvedProvider {
  claude?: {
    providerId: string;
    providerName: string;
    baseUrl: string;
    key: string;
    model?: string;
  };
  codex?: {
    providerId: string;
    providerName: string;
    baseUrl: string;
    key: string;
    model?: string;
    codexProviderId: string;
    wireApi: 'responses' | 'chat';
  };
  missingSecrets: ToolId[];
  degraded: string[];
}

export type StatusKind = 'off' | 'ready' | 'missingKey' | 'modelsStale' | 'degraded';

export interface StatusState {
  kind: StatusKind;
  detail?: string;
}

export interface ToolRuntimeState {
  tool: ToolId;
  providerName?: string;
  baseUrl?: string;
  model?: string;
  matchedProviderId?: string;
  configPath: string;
}
