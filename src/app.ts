import * as fs from 'fs/promises';
import { basename, dirname } from 'path';
import * as vscode from 'vscode';
import { ClaudeAdapter } from './adapters/claudeAdapter';
import { CodexAdapter } from './adapters/codexAdapter';
import { pathExists } from './config/atomicWrite';
import { fetchModels } from './models/modelFetcher';
import { ModelResolver } from './models/modelResolver';
import { ProviderStore } from './storage/providerStore';
import { SecretStore } from './storage/secretStore';
import { EnvManager } from './terminal/envManager';
import { TerminalManager } from './terminal/terminalManager';
import { ModelInfo, ModelPolicy, ProviderProfile, PublicConfigFile, ResolvedProvider, StatusState, ToolId, ToolRuntimeState } from './types';
import {
  CreateProviderInput,
  SidebarViewProvider,
  SidebarViewState,
  toSidebarSummary
} from './ui/sidebarView';
import { StatusBarController } from './ui/statusBar';
import { fingerprintSecret } from './utils/hash';
import { createId, slugify } from './utils/ids';

type MenuAction =
  | 'switchProvider'
  | 'addProvider'
  | 'applyCurrentProvider'
  | 'openClaudeTerminal'
  | 'openCodexTerminal'
  | 'refreshModels'
  | 'viewClaudeConfig'
  | 'viewCodexConfig'
  | 'exportPublicConfig'
  | 'importPublicConfig';

type MenuItem = vscode.QuickPickItem & { action: MenuAction };

export class VSModelSwitchApp implements vscode.Disposable {
  private readonly store: ProviderStore;
  private readonly secretStore: SecretStore;
  private readonly modelResolver: ModelResolver;
  private readonly envManager: EnvManager;
  private readonly terminalManager = new TerminalManager();
  private readonly statusBar = new StatusBarController();
  private readonly claudeAdapter = new ClaudeAdapter();
  private readonly codexAdapter = new CodexAdapter();
  private readonly sidebarView: SidebarViewProvider;
  private readonly fileWatchers: vscode.FileSystemWatcher[] = [];
  private readonly runtimeState: Record<ToolId, ToolRuntimeState>;
  private lastEnv: Record<string, string> = {};
  private status: StatusState = { kind: 'off' };

  constructor(private readonly context: vscode.ExtensionContext) {
    this.store = new ProviderStore(context);
    this.secretStore = new SecretStore(context.secrets);
    this.modelResolver = new ModelResolver(this.store);
    this.envManager = new EnvManager(context);
    this.runtimeState = {
      claude: {
        tool: 'claude',
        configPath: this.claudeAdapter.getConfigPath()
      },
      codex: {
        tool: 'codex',
        configPath: this.codexAdapter.getConfigPath()
      }
    };
    this.sidebarView = new SidebarViewProvider(context.extensionUri, this);
    this.context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, this.sidebarView),
      this.sidebarView
    );
    this.registerCommands();
    this.registerConfigWatchers();
    void this.initializeCurrentProviders();
  }

  dispose(): void {
    this.statusBar.dispose();
    for (const watcher of this.fileWatchers) {
      watcher.dispose();
    }
  }

  private registerCommands(): void {
    const register = (command: string, handler: () => Promise<void> | void) => {
      this.context.subscriptions.push(
        vscode.commands.registerCommand(command, async () => {
          try {
            await handler();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`VSModelSwitch: ${message}`);
          }
        })
      );
    };

    register('vsmodelswitch.openMenu', () => this.openMenu());
    register('vsmodelswitch.addProvider', () => this.addProvider());
    register('vsmodelswitch.switchProvider', () => this.switchProvider());
    register('vsmodelswitch.refreshModels', () => this.refreshModels());
    register('vsmodelswitch.openClaudeTerminal', () => this.openClaudeTerminal());
    register('vsmodelswitch.openCodexTerminal', () => this.openCodexTerminal());
    register('vsmodelswitch.viewClaudeConfig', () => this.viewConfig('claude'));
    register('vsmodelswitch.viewCodexConfig', () => this.viewConfig('codex'));
    register('vsmodelswitch.exportPublicConfig', () => this.exportPublicConfig());
    register('vsmodelswitch.importPublicConfig', () => this.importPublicConfig());
    register('vsmodelswitch.applyCurrentProvider', () => this.applyCurrentProviderWithMessage());
  }

  async getSidebarState(): Promise<SidebarViewState> {
    const providers = await Promise.all(
      this.store.getProviders().map((provider) =>
        toSidebarSummary(provider, async (item) => Boolean(await this.secretStore.get(item.secretRef)))
      )
    );

    return {
      providers,
      currentProviderIds: this.store.getCurrentProviderIds(),
      status: this.status,
      globalCliSync: vscode.workspace.getConfiguration('vsmodelswitch').get<boolean>('globalCliSync', true),
      configTarget: vscode.workspace.getConfiguration('vsmodelswitch').get<string>('configTarget', 'real'),
      configPaths: {
        claude: this.claudeAdapter.getConfigPath(),
        codex: this.codexAdapter.getConfigPath()
      }
    };
  }

  async previewModelsFromSidebar(tool: ToolId, baseUrl: string, key: string): Promise<ModelInfo[]> {
    if (!baseUrl.trim() || !key) {
      throw new Error('URL and key are required before fetching models');
    }
    return this.fetchAndCacheModels(tool, baseUrl.trim(), key);
  }

  async createProviderFromSidebar(input: CreateProviderInput): Promise<void> {
    await this.createProvider(input);
  }

  async setCurrentProviderFromSidebar(providerId: string): Promise<void> {
    const provider = this.store.getProvider(providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    await this.store.setCurrentProviderId(provider.tool, provider.id);
    await this.applyCurrentProvider();
  }

  async setProviderKeyFromSidebar(providerId: string): Promise<void> {
    const provider = this.store.getProvider(providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    const key = await this.promptRequiredInput(`${labelTool(provider.tool)} API Key for ${provider.name}`, 'sk-...', true);
    if (!key) {
      return;
    }
    if (!key.trim()) {
      throw new Error('API key is required');
    }
    await this.secretStore.store(provider.secretRef, key);
    if (this.store.getCurrentProviderId(provider.tool) === provider.id) {
      await this.applyCurrentProvider();
    } else {
      this.refreshStatus();
    }
  }

  async updateProviderModelFromSidebar(providerId: string): Promise<void> {
    await this.updateProviderModel(providerId);
  }

  async applyCurrentProviderFromSidebar(): Promise<void> {
    await this.applyCurrentProviderWithMessage();
  }

  async refreshModelsFromSidebar(tool?: ToolId): Promise<void> {
    await this.refreshModels(tool);
  }

  async openClaudeTerminalFromSidebar(): Promise<void> {
    await this.openClaudeTerminal();
  }

  async openCodexTerminalFromSidebar(): Promise<void> {
    await this.openCodexTerminal();
  }

  async viewConfigFromSidebar(tool: ToolId): Promise<void> {
    await this.viewConfig(tool);
  }

  async exportPublicConfigFromSidebar(): Promise<void> {
    await this.exportPublicConfig();
  }

  async importPublicConfigFromSidebar(): Promise<void> {
    await this.importPublicConfig();
  }

  private refreshStatus(): void {
    this.statusBar.update(this.runtimeState);
    void this.sidebarView.refresh();
  }

  private async initializeCurrentProviders(): Promise<void> {
    await this.scanCurrentProvidersFromConfig();
    const hasCurrent = Boolean(this.store.getCurrentProvider('claude') || this.store.getCurrentProvider('codex'));
    this.status = hasCurrent ? { kind: 'ready' } : { kind: 'off' };
    this.refreshStatus();
  }

  private async scanCurrentProvidersFromConfig(): Promise<void> {
    const providers = this.store.getProviders();
    const [claudeConfig, codexConfig]: [
      { baseUrl?: string; model?: string },
      { baseUrl?: string; model?: string; providerId?: string }
    ] = await Promise.all([
      this.claudeAdapter.readActiveConfig().catch(() => ({})),
      this.codexAdapter.readActiveConfig().catch(() => ({}))
    ]);

    const claude = matchProviderFromConfig(providers, 'claude', claudeConfig.baseUrl, claudeConfig.model);
    if (claude) {
      await this.store.setCurrentProviderId('claude', claude.id);
    }
    this.runtimeState.claude = {
      tool: 'claude',
      providerName: claude?.name,
      baseUrl: claudeConfig.baseUrl,
      model: claudeConfig.model,
      matchedProviderId: claude?.id,
      configPath: this.claudeAdapter.getConfigPath()
    };

    const codex = matchProviderFromConfig(providers, 'codex', codexConfig.baseUrl, codexConfig.model);
    if (codex) {
      await this.store.setCurrentProviderId('codex', codex.id);
    }
    this.runtimeState.codex = {
      tool: 'codex',
      providerName: codex?.name,
      baseUrl: codexConfig.baseUrl,
      model: codexConfig.model,
      matchedProviderId: codex?.id,
      configPath: this.codexAdapter.getConfigPath()
    };
  }

  private registerConfigWatchers(): void {
    for (const tool of ['claude', 'codex'] as ToolId[]) {
      const configPath = tool === 'claude' ? this.claudeAdapter.getConfigPath() : this.codexAdapter.getConfigPath();
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(dirname(configPath)), basename(configPath)));
      const refresh = () => {
        void this.initializeCurrentProviders();
      };
      watcher.onDidCreate(refresh, undefined, this.context.subscriptions);
      watcher.onDidChange(refresh, undefined, this.context.subscriptions);
      watcher.onDidDelete(refresh, undefined, this.context.subscriptions);
      this.fileWatchers.push(watcher);
      this.context.subscriptions.push(watcher);
    }
  }

  private async openMenu(): Promise<void> {
    const items: MenuItem[] = [
      { label: 'Switch Provider', action: 'switchProvider' },
      { label: 'Add Provider', action: 'addProvider' },
      { label: 'Apply Current Providers', action: 'applyCurrentProvider' },
      { label: 'Open Claude Terminal', action: 'openClaudeTerminal' },
      { label: 'Open Codex Terminal', action: 'openCodexTerminal' },
      { label: 'Refresh Models', action: 'refreshModels' },
      { label: 'View Claude Config', action: 'viewClaudeConfig' },
      { label: 'View Codex Config', action: 'viewCodexConfig' },
      { label: 'Export Public Config', action: 'exportPublicConfig' },
      { label: 'Import Public Config', action: 'importPublicConfig' }
    ];
    const action = await vscode.window.showQuickPick(items, { placeHolder: 'VSModelSwitch' });
    if (!action) {
      return;
    }

    if (action.action === 'viewClaudeConfig') {
      await this.viewConfig('claude');
      return;
    }
    if (action.action === 'viewCodexConfig') {
      await this.viewConfig('codex');
      return;
    }

    await vscode.commands.executeCommand(`vsmodelswitch.${action.action}`);
  }

  private async addProvider(): Promise<void> {
    const toolPick = await vscode.window.showQuickPick(
      [
        { label: 'Claude Code', tool: 'claude' as ToolId },
        { label: 'Codex', tool: 'codex' as ToolId }
      ],
      { title: 'Provider Type' }
    );
    if (!toolPick) {
      return;
    }

    const name = await this.promptRequiredInput('Provider Name', 'OpenRouter, DeepSeek, Work Proxy');
    const baseUrl = await this.promptRequiredInput(`${toolPick.label} Base URL`, 'https://api.example.com');
    const key = await this.promptRequiredInput(`${toolPick.label} API Key`, 'sk-...', true);
    if (!name || !baseUrl || !key) {
      return;
    }

    const models = await this.fetchAndCacheModels(toolPick.tool, baseUrl, key);
    const model = await this.pickModel(toolPick.tool, models);
    if (!model) {
      return;
    }

    await this.createProvider({
      tool: toolPick.tool,
      name,
      baseUrl,
      key,
      model,
      applyNow: true
    });
  }

  private async createProvider(input: CreateProviderInput): Promise<void> {
    if (!input.name.trim()) {
      throw new Error('Provider name is required');
    }
    if (!input.baseUrl.trim()) {
      throw new Error('Base URL is required');
    }
    if (!input.key) {
      throw new Error('API key is required');
    }
    if (!input.model.trim()) {
      throw new Error('Select a model before saving');
    }

    const id = createId(slugify(`${input.tool}-${input.name}`));
    const secretRef = SecretStore.ref(id, input.tool);
    await this.secretStore.store(secretRef, input.key);

    const now = new Date().toISOString();
    const provider: ProviderProfile = {
      id,
      name: input.name.trim(),
      tool: input.tool,
      baseUrl: input.baseUrl.trim().replace(/\/+$/g, ''),
      modelPolicy: {
        type: 'fixed',
        model: input.model.trim()
      },
      secretRef,
      createdAt: now,
      updatedAt: now
    };

    if (input.tool === 'codex') {
      provider.codex = {
        providerId: slugify(input.name),
        wireApi: 'responses'
      };
    }

    await this.store.upsertProvider(provider);
    await this.store.setCurrentProviderId(input.tool, provider.id);

    if (input.applyNow) {
      await this.applyCurrentProvider();
    } else {
      this.status = { kind: 'ready' };
      this.refreshStatus();
    }
  }

  private async switchProvider(): Promise<void> {
    const toolPick = await vscode.window.showQuickPick(
      [
        { label: 'Claude Code', tool: 'claude' as ToolId },
        { label: 'Codex', tool: 'codex' as ToolId }
      ],
      { title: 'Switch Tool Provider' }
    );
    if (!toolPick) {
      return;
    }

    const providers = this.store.getProvidersByTool(toolPick.tool);
    if (providers.length === 0) {
      void vscode.window.showInformationMessage(`No ${toolPick.label} providers yet. Add one first.`);
      return;
    }

    const currentId = this.store.getCurrentProviderId(toolPick.tool);
    const selected = await vscode.window.showQuickPick(
      providers.map((provider) => ({
        label: provider.name,
        description: labelModel(provider.modelPolicy),
        detail: provider.id === currentId ? 'current' : provider.baseUrl,
        provider
      })),
      { title: `Switch ${toolPick.label} Provider` }
    );
    if (!selected) {
      return;
    }

    await this.store.setCurrentProviderId(toolPick.tool, selected.provider.id);
    await this.applyCurrentProviderWithMessage();
  }

  private async applyCurrentProviderWithMessage(): Promise<void> {
    const result = await this.applyCurrentProvider();
    if (!result) {
      return;
    }

    if (result.missingSecrets.length > 0) {
      void vscode.window.showWarningMessage(`Provider applied with missing keys: ${result.missingSecrets.join(', ')}`);
      return;
    }
    if (result.degraded.length > 0) {
      void vscode.window.showWarningMessage(`Provider applied with issues: ${result.degraded.join('; ')}`);
      return;
    }
    void vscode.window.showInformationMessage('Providers applied to new VSCode terminals and CLI config files.');
  }

  private async applyCurrentProvider(): Promise<ResolvedProvider | undefined> {
    const claudeProvider = this.store.getCurrentProvider('claude');
    const codexProvider = this.store.getCurrentProvider('codex');

    if (!claudeProvider && !codexProvider) {
      this.status = { kind: 'off' };
      this.refreshStatus();
      void vscode.window.showInformationMessage('No active providers.');
      return undefined;
    }

    const resolved: ResolvedProvider = {
      missingSecrets: [],
      degraded: []
    };

    if (claudeProvider) {
      const claude = await this.resolveProvider(claudeProvider, true);
      if (claude) {
        resolved.claude = {
          providerId: claudeProvider.id,
          providerName: claudeProvider.name,
          baseUrl: claudeProvider.baseUrl,
          key: claude.key,
          model: claude.model
        };
      } else {
        resolved.missingSecrets.push('claude');
      }
    }

    if (codexProvider) {
      const codex = await this.resolveProvider(codexProvider, true);
      if (codex) {
        resolved.codex = {
          providerId: codexProvider.id,
          providerName: codexProvider.name,
          baseUrl: codexProvider.baseUrl,
          key: codex.key,
          model: codex.model,
          codexProviderId: codexProvider.codex?.providerId ?? slugify(codexProvider.name),
          wireApi: codexProvider.codex?.wireApi ?? 'responses'
        };
      } else {
        resolved.missingSecrets.push('codex');
      }
    }

    this.lastEnv = this.envManager.apply(resolved);

    if (vscode.workspace.getConfiguration('vsmodelswitch').get<boolean>('globalCliSync', true)) {
      await this.claudeAdapter.apply(resolved);
      await this.codexAdapter.apply(resolved);
    }

    this.status = statusFromResolved(resolved);
    await this.scanCurrentProvidersFromConfig();
    this.refreshStatus();
    return resolved;
  }

  private async resolveProvider(
    provider: ProviderProfile,
    promptForMissingKeys: boolean
  ): Promise<{ key: string; model?: string } | undefined> {
    let key = await this.secretStore.get(provider.secretRef);
    if (!key && promptForMissingKeys) {
      key = await this.promptRequiredInput(`${labelTool(provider.tool)} API Key for ${provider.name}`, 'sk-...', true);
      if (key) {
        await this.secretStore.store(provider.secretRef, key);
      }
    }

    if (!key) {
      return undefined;
    }

    return {
      key,
      model: await this.modelResolver.resolve(provider.tool, provider, key)
    };
  }

  private async refreshModels(tool?: ToolId): Promise<void> {
    const tools: ToolId[] = tool ? [tool] : ['claude', 'codex'];
    const refreshed: string[] = [];
    const failed: string[] = [];

    for (const item of tools) {
      const provider = this.store.getCurrentProvider(item);
      if (!provider) {
        continue;
      }

      const key = await this.secretStore.get(provider.secretRef);
      if (!key) {
        failed.push(`${labelTool(item)} key missing`);
        continue;
      }

      try {
        const models = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Refreshing ${labelTool(item)} models`,
            cancellable: false
          },
          () => this.modelResolver.refresh(item, provider, key)
        );
        refreshed.push(`${labelTool(item)}: ${models.length}`);
      } catch (error) {
        failed.push(`${labelTool(item)} ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (failed.length > 0) {
      this.status = { kind: 'degraded', detail: failed.join('; ') };
      this.refreshStatus();
      void vscode.window.showWarningMessage(`Model refresh finished with issues: ${failed.join('; ')}`);
    } else {
      this.status = { kind: 'ready' };
      this.refreshStatus();
      void vscode.window.showInformationMessage(`Model refresh complete: ${refreshed.join(', ') || 'no active providers'}`);
    }
  }

  private async updateProviderModel(providerId: string): Promise<void> {
    const provider = this.store.getProvider(providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const key = await this.secretStore.get(provider.secretRef);
    if (!key) {
      throw new Error(`${labelTool(provider.tool)} key missing for ${provider.name}`);
    }

    const models = await this.fetchAndCacheModels(provider.tool, provider.baseUrl, key);
    const model = await this.pickModel(provider.tool, models);
    if (!model) {
      return;
    }

    await this.store.updateProvider(provider.id, (current) => ({
      ...current,
      modelPolicy: {
        type: 'fixed',
        model
      },
      updatedAt: new Date().toISOString()
    }));

    if (this.store.getCurrentProviderId(provider.tool) === provider.id) {
      await this.applyCurrentProvider();
    } else {
      this.refreshStatus();
    }
  }

  private async openClaudeTerminal(): Promise<void> {
    const resolved = await this.applyCurrentProvider();
    if (!resolved?.claude) {
      void vscode.window.showWarningMessage('Claude Code provider is not configured.');
      return;
    }
    this.terminalManager.openClaude(this.lastEnv);
  }

  private async openCodexTerminal(): Promise<void> {
    const resolved = await this.applyCurrentProvider();
    if (!resolved?.codex) {
      void vscode.window.showWarningMessage('Codex provider is not configured.');
      return;
    }
    this.terminalManager.openCodex(this.lastEnv);
  }

  private async viewConfig(tool: ToolId): Promise<void> {
    const filePath = tool === 'claude' ? this.claudeAdapter.getConfigPath() : this.codexAdapter.getConfigPath();
    if (!(await pathExists(filePath))) {
      void vscode.window.showWarningMessage(`${labelTool(tool)} config file does not exist yet: ${filePath}`);
      return;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(document, { preview: true });
  }

  private async exportPublicConfig(): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      title: 'Export Public Config',
      filters: { JSON: ['json'] },
      saveLabel: 'Export'
    });
    if (!uri) {
      return;
    }

    const config: PublicConfigFile = {
      version: 1,
      currentProviderIds: this.store.getCurrentProviderIds(),
      providers: this.store.getProviders()
    };
    await fs.writeFile(uri.fsPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    void vscode.window.showInformationMessage('Public config exported without API keys.');
  }

  private async importPublicConfig(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      title: 'Import Public Config',
      canSelectMany: false,
      filters: { JSON: ['json'] },
      openLabel: 'Import'
    });
    const uri = uris?.[0];
    if (!uri) {
      return;
    }

    const parsed = JSON.parse(await fs.readFile(uri.fsPath, 'utf8')) as PublicConfigFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.providers)) {
      throw new Error('Unsupported config file');
    }

    const mode = await vscode.window.showQuickPick(
      [
        { label: 'Merge', description: 'Keep existing providers and add imported providers', value: 'merge' },
        { label: 'Replace', description: 'Replace all local provider metadata', value: 'replace' }
      ],
      { title: 'Import Strategy' }
    );
    if (!mode) {
      return;
    }

    if (mode.value === 'replace') {
      await this.store.saveProviders(parsed.providers);
    } else {
      const providers = this.store.getProviders();
      for (const provider of parsed.providers) {
        const index = providers.findIndex((item) => item.id === provider.id);
        if (index >= 0) {
          providers[index] = provider;
        } else {
          providers.push(provider);
        }
      }
      await this.store.saveProviders(providers);
    }

    if (parsed.currentProviderIds) {
      if (parsed.currentProviderIds.claude) {
        await this.store.setCurrentProviderId('claude', parsed.currentProviderIds.claude);
      }
      if (parsed.currentProviderIds.codex) {
        await this.store.setCurrentProviderId('codex', parsed.currentProviderIds.codex);
      }
    }

    this.status = { kind: 'missingKey', detail: 'Imported provider metadata does not include API keys.' };
    this.refreshStatus();
    void vscode.window.showInformationMessage('Public config imported. API keys must be entered on this machine.');
  }

  private async fetchAndCacheModels(tool: ToolId, baseUrl: string, key: string): Promise<ModelInfo[]> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Fetching ${labelTool(tool)} models`,
        cancellable: false
      },
      async () => {
        const normalized = baseUrl.trim().replace(/\/+$/g, '');
        const models = await fetchModels(tool, normalized, key);
        await this.store.saveModelCache({
          tool,
          baseUrl: normalized,
          keyFingerprint: fingerprintSecret(key),
          fetchedAt: new Date().toISOString(),
          ttlMs: 24 * 60 * 60 * 1000,
          models
        });
        return models;
      }
    );
  }

  private async pickModel(tool: ToolId, models: ModelInfo[]): Promise<string | undefined> {
    if (models.length === 0) {
      void vscode.window.showWarningMessage(`${labelTool(tool)} model list is empty.`);
      return undefined;
    }

    const selected = await vscode.window.showQuickPick(
      models.map((model) => ({
        label: model.id,
        description: model.displayName,
        model
      })),
      { title: `Select ${labelTool(tool)} Model` }
    );
    return selected?.model.id;
  }

  private async promptRequiredInput(title: string, placeHolder: string, password = false): Promise<string | undefined> {
    return vscode.window.showInputBox({
      title,
      placeHolder,
      password,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : 'Required')
    });
  }
}

function labelTool(tool: ToolId): string {
  return tool === 'claude' ? 'Claude Code' : 'Codex';
}

function labelModel(policy: ModelPolicy): string {
  if (policy.type === 'toolDefault') {
    return 'Tool default';
  }
  if (policy.type === 'providerAuto') {
    return policy.preferred ? `Auto: ${policy.preferred}` : 'Auto';
  }
  return policy.model;
}

function statusFromResolved(resolved: ResolvedProvider): StatusState {
  if (resolved.missingSecrets.length > 0) {
    return {
      kind: 'missingKey',
      detail: `Missing keys: ${resolved.missingSecrets.join(', ')}`
    };
  }
  if (resolved.degraded.length > 0) {
    return {
      kind: 'degraded',
      detail: resolved.degraded.join('; ')
    };
  }
  return { kind: 'ready' };
}

function matchProviderFromConfig(
  providers: ProviderProfile[],
  tool: ToolId,
  baseUrl: string | undefined,
  model: string | undefined
): ProviderProfile | undefined {
  if (!baseUrl) {
    return undefined;
  }

  const normalizedBaseUrl = normalizeUrl(baseUrl);
  const candidates = providers.filter((provider) => {
    if (provider.tool !== tool || normalizeUrl(provider.baseUrl) !== normalizedBaseUrl) {
      return false;
    }
    const providerModel = provider.modelPolicy.type === 'fixed' || provider.modelPolicy.type === 'custom'
      ? provider.modelPolicy.model
      : provider.modelPolicy.type === 'providerAuto'
        ? provider.modelPolicy.preferred
        : undefined;
    return !model || !providerModel || providerModel === model;
  });

  return candidates[0];
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/g, '');
}
