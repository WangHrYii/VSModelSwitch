import * as vscode from 'vscode';
import { ModelInfo, ModelPolicy, ProviderProfile, StatusState, ToolId } from '../types';

export interface SidebarProviderSummary {
  id: string;
  name: string;
  tool: ToolId;
  baseUrl: string;
  modelPolicy: ModelPolicy;
  hasKey: boolean;
}

export interface SidebarViewState {
  providers: SidebarProviderSummary[];
  currentProviderIds: Partial<Record<ToolId, string>>;
  status: StatusState;
  globalCliSync: boolean;
  configTarget: string;
  configPaths: Record<ToolId, string>;
}

export interface CreateProviderInput {
  tool: ToolId;
  name: string;
  baseUrl: string;
  key: string;
  model: string;
  applyNow: boolean;
}

export interface SidebarController {
  getSidebarState(): Promise<SidebarViewState>;
  previewModelsFromSidebar(tool: ToolId, baseUrl: string, key: string): Promise<ModelInfo[]>;
  createProviderFromSidebar(input: CreateProviderInput): Promise<void>;
  setCurrentProviderFromSidebar(providerId: string): Promise<void>;
  setProviderKeyFromSidebar(providerId: string): Promise<void>;
  updateProviderModelFromSidebar(providerId: string): Promise<void>;
  applyCurrentProviderFromSidebar(): Promise<void>;
  refreshModelsFromSidebar(tool?: ToolId): Promise<void>;
  openClaudeTerminalFromSidebar(): Promise<void>;
  openCodexTerminalFromSidebar(): Promise<void>;
  viewConfigFromSidebar(tool: ToolId): Promise<void>;
  exportPublicConfigFromSidebar(): Promise<void>;
  importPublicConfigFromSidebar(): Promise<void>;
}

type IncomingMessage =
  | { type: 'ready' }
  | { type: 'previewModels'; tool: ToolId; baseUrl: string; key: string }
  | { type: 'createProvider'; payload: CreateProviderInput }
  | { type: 'setCurrentProvider'; providerId: string }
  | { type: 'setProviderKey'; providerId: string }
  | { type: 'updateProviderModel'; providerId: string }
  | { type: 'refreshModels'; tool?: ToolId }
  | { type: 'openClaudeTerminal' }
  | { type: 'openCodexTerminal' }
  | { type: 'viewConfig'; tool: ToolId }
  | { type: 'exportPublicConfig' }
  | { type: 'importPublicConfig' };

export class SidebarViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'vsmodelswitch.providerView';

  private view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: SidebarController
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webview.html = this.getHtml();

    this.disposables.push(
      webview.onDidReceiveMessage(async (message: IncomingMessage) => {
        await this.handleMessage(message);
      })
    );

    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    await this.view.webview.postMessage({
      type: 'state',
      state: await this.controller.getSidebarState()
    });
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    try {
      if (message.type !== 'ready') {
        await this.postBusy(true);
      }

      switch (message.type) {
        case 'ready':
          await this.refresh();
          return;
        case 'previewModels': {
          const models = await this.controller.previewModelsFromSidebar(message.tool, message.baseUrl, message.key);
          await this.view?.webview.postMessage({ type: 'models', models });
          await this.postNotice(`Fetched ${models.length} models.`);
          break;
        }
        case 'createProvider':
          await this.controller.createProviderFromSidebar(message.payload);
          await this.postNotice('Provider saved.');
          break;
        case 'setCurrentProvider':
          await this.controller.setCurrentProviderFromSidebar(message.providerId);
          await this.postNotice('Provider applied.');
          break;
        case 'setProviderKey':
          await this.controller.setProviderKeyFromSidebar(message.providerId);
          await this.postNotice('API key saved on this machine.');
          break;
        case 'updateProviderModel':
          await this.controller.updateProviderModelFromSidebar(message.providerId);
          await this.postNotice('Provider model updated.');
          break;
        case 'refreshModels':
          await this.controller.refreshModelsFromSidebar(message.tool);
          await this.postNotice('Model refresh finished.');
          break;
        case 'openClaudeTerminal':
          await this.controller.openClaudeTerminalFromSidebar();
          break;
        case 'openCodexTerminal':
          await this.controller.openCodexTerminalFromSidebar();
          break;
        case 'viewConfig':
          await this.controller.viewConfigFromSidebar(message.tool);
          break;
        case 'exportPublicConfig':
          await this.controller.exportPublicConfigFromSidebar();
          break;
        case 'importPublicConfig':
          await this.controller.importPublicConfigFromSidebar();
          break;
      }

      await this.refresh();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      await this.postError(text);
      void vscode.window.showErrorMessage(`VSModelSwitch: ${text}`);
    } finally {
      await this.postBusy(false);
    }
  }

  private async postBusy(busy: boolean): Promise<void> {
    await this.view?.webview.postMessage({ type: 'busy', busy });
  }

  private async postNotice(message: string): Promise<void> {
    await this.view?.webview.postMessage({ type: 'notice', message });
  }

  private async postError(message: string): Promise<void> {
    await this.view?.webview.postMessage({ type: 'error', message });
  }

  private getHtml(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>VSModelSwitch</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-sideBar-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.45;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 16px; font-weight: 650; }
    h2 { font-size: 13px; font-weight: 650; }
    h3 { font-size: 12px; font-weight: 650; }
    .shell { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .topline { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .status, .notice, .empty, .panel, .provider {
      border: 1px solid var(--vscode-sideBarSectionHeader-border);
      border-radius: 6px;
    }
    .status {
      padding: 7px 8px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-sideBarSectionHeader-background);
    }
    .notice {
      display: none;
      padding: 7px 8px;
      border-color: var(--vscode-inputValidation-infoBorder);
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-inputValidation-infoForeground);
    }
    .notice.visible { display: block; }
    .notice.error {
      border-color: var(--vscode-inputValidation-errorBorder);
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
    }
    .section { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .sectionHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .sectionHeader button {
      flex: 0 0 auto;
      min-height: 24px;
      padding: 2px 7px;
    }
    .panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      background: var(--vscode-editor-background);
    }
    .providerList { display: flex; flex-direction: column; gap: 4px; }
    .provider {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding: 7px 8px;
      background: var(--vscode-sideBar-background);
    }
    .provider.active { border-color: var(--vscode-focusBorder); }
    .providerName { font-weight: 650; overflow-wrap: anywhere; }
    .providerModel {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .providerWarning {
      color: var(--vscode-inputValidation-warningForeground);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .providerMeta {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .rowActions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .rowActions button {
      min-height: 24px;
      padding: 2px 7px;
      white-space: nowrap;
    }
    .badge {
      flex: 0 0 auto;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
      line-height: 16px;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .actions.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .actions.tool { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    button {
      min-height: 28px;
      padding: 4px 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { cursor: not-allowed; opacity: 0.55; }
    form { display: flex; flex-direction: column; gap: 10px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    label { color: var(--vscode-descriptionForeground); font-size: 12px; }
    input, select {
      width: 100%;
      min-height: 28px;
      padding: 4px 7px;
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: inherit;
      font-size: 12px;
    }
    input:focus, select:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    .check { display: flex; align-items: center; gap: 7px; color: var(--vscode-sideBar-foreground); font-size: 12px; }
    .check input { width: auto; min-height: auto; margin: 0; }
    .empty {
      padding: 9px;
      border-style: dashed;
      color: var(--vscode-descriptionForeground);
    }
    .small { color: var(--vscode-descriptionForeground); font-size: 12px; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="topline">
      <h1>VSModelSwitch</h1>
      <button id="reloadButton">Refresh</button>
    </div>
    <div id="status" class="status">Loading...</div>
    <div id="notice" class="notice"></div>

    <section class="section">
      <div class="sectionHeader">
        <h2>Claude Code Providers</h2>
        <button id="viewClaudeConfigButton">Config</button>
      </div>
      <div class="panel">
        <div id="claudeProviders" class="providerList"></div>
        <div class="actions tool">
          <button id="openClaudeButton">Terminal</button>
          <button id="refreshClaudeModelsButton">Refresh</button>
        </div>
        <div id="claudePath" class="small"></div>
      </div>
    </section>

    <section class="section">
      <div class="sectionHeader">
        <h2>Codex Providers</h2>
        <button id="viewCodexConfigButton">Config</button>
      </div>
      <div class="panel">
        <div id="codexProviders" class="providerList"></div>
        <div class="actions tool">
          <button id="openCodexButton">Terminal</button>
          <button id="refreshCodexModelsButton">Refresh</button>
        </div>
        <div id="codexPath" class="small"></div>
      </div>
    </section>

    <section class="section">
      <h2>Add Provider</h2>
      <form id="providerForm" class="panel">
        <div class="field">
          <label for="tool">Tool</label>
          <select id="tool">
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
          </select>
        </div>
        <div class="field">
          <label for="providerName">Name</label>
          <input id="providerName" type="text" placeholder="Local Mock" autocomplete="off" required>
        </div>
        <div class="field">
          <label for="baseUrl">Base URL</label>
          <input id="baseUrl" type="text" placeholder="http://localhost:8787" autocomplete="off" required>
        </div>
        <div class="field">
          <label for="apiKey">API Key</label>
          <input id="apiKey" type="password" placeholder="test-key" autocomplete="off" required>
        </div>
        <button id="fetchModelsButton" type="button">Fetch Models</button>
        <div class="field">
          <label for="modelSelect">Model</label>
          <select id="modelSelect" disabled>
            <option value="">Fetch models first</option>
          </select>
        </div>
        <label class="check"><input id="applyNow" type="checkbox" checked> Set active after saving</label>
        <button id="saveButton" class="primary" type="submit" disabled>Save Provider</button>
        <div class="small">Each provider belongs to exactly one tool. Fetch models, then choose the model to save.</div>
      </form>
    </section>

    <section class="section">
      <h2>Global Actions</h2>
      <div class="actions">
        <button id="refreshModelsButton">Refresh Models</button>
        <button id="exportButton">Export</button>
        <button id="importButton">Import</button>
      </div>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = {
      providers: [],
      currentProviderIds: {},
      status: { kind: 'off' },
      globalCliSync: true,
      configTarget: 'sandbox',
      configPaths: { claude: '', codex: '' }
    };
    let busy = false;
    let fetchedModels = [];

    const el = {
      status: document.getElementById('status'),
      notice: document.getElementById('notice'),
      claudeProviders: document.getElementById('claudeProviders'),
      codexProviders: document.getElementById('codexProviders'),
      form: document.getElementById('providerForm'),
      tool: document.getElementById('tool'),
      providerName: document.getElementById('providerName'),
      baseUrl: document.getElementById('baseUrl'),
      apiKey: document.getElementById('apiKey'),
      fetchModelsButton: document.getElementById('fetchModelsButton'),
      modelSelect: document.getElementById('modelSelect'),
      applyNow: document.getElementById('applyNow'),
      saveButton: document.getElementById('saveButton'),
      reloadButton: document.getElementById('reloadButton'),
      openClaudeButton: document.getElementById('openClaudeButton'),
      openCodexButton: document.getElementById('openCodexButton'),
      viewClaudeConfigButton: document.getElementById('viewClaudeConfigButton'),
      viewCodexConfigButton: document.getElementById('viewCodexConfigButton'),
      claudePath: document.getElementById('claudePath'),
      codexPath: document.getElementById('codexPath'),
      refreshClaudeModelsButton: document.getElementById('refreshClaudeModelsButton'),
      refreshCodexModelsButton: document.getElementById('refreshCodexModelsButton'),
      refreshModelsButton: document.getElementById('refreshModelsButton'),
      exportButton: document.getElementById('exportButton'),
      importButton: document.getElementById('importButton')
    };

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        state = message.state;
        render();
        return;
      }
      if (message.type === 'models') {
        fetchedModels = message.models || [];
        renderModelOptions();
        return;
      }
      if (message.type === 'busy') {
        busy = message.busy;
        setBusy(busy);
        return;
      }
      if (message.type === 'notice') {
        showNotice(message.message, false);
        return;
      }
      if (message.type === 'error') {
        showNotice(message.message, true);
      }
    });

    el.reloadButton.addEventListener('click', () => post({ type: 'ready' }));
    el.openClaudeButton.addEventListener('click', () => post({ type: 'openClaudeTerminal' }));
    el.openCodexButton.addEventListener('click', () => post({ type: 'openCodexTerminal' }));
    el.viewClaudeConfigButton.addEventListener('click', () => post({ type: 'viewConfig', tool: 'claude' }));
    el.viewCodexConfigButton.addEventListener('click', () => post({ type: 'viewConfig', tool: 'codex' }));
    el.refreshClaudeModelsButton.addEventListener('click', () => post({ type: 'refreshModels', tool: 'claude' }));
    el.refreshCodexModelsButton.addEventListener('click', () => post({ type: 'refreshModels', tool: 'codex' }));
    el.refreshModelsButton.addEventListener('click', () => post({ type: 'refreshModels' }));
    el.exportButton.addEventListener('click', () => post({ type: 'exportPublicConfig' }));
    el.importButton.addEventListener('click', () => post({ type: 'importPublicConfig' }));
    el.fetchModelsButton.addEventListener('click', () => fetchModels());
    el.form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveProvider();
    });
    el.tool.addEventListener('change', resetModels);
    el.baseUrl.addEventListener('input', resetModels);
    el.apiKey.addEventListener('input', resetModels);
    el.modelSelect.addEventListener('change', updateSaveState);

    function render() {
      renderStatus();
      renderProviderList('claude', el.claudeProviders);
      renderProviderList('codex', el.codexProviders);
      el.claudePath.textContent = 'Config: ' + state.configPaths.claude;
      el.codexPath.textContent = 'Config: ' + state.configPaths.codex;
      updateActionState();
      updateSaveState();
    }

    function renderStatus() {
      const claude = findCurrent('claude');
      const codex = findCurrent('codex');
      const parts = [];
      parts.push('Claude: ' + (claude ? claude.name : 'Off'));
      parts.push('Codex: ' + (codex ? codex.name : 'Off'));
      parts.push('Status: ' + labelStatus(state.status.kind));
      parts.push(state.globalCliSync ? 'Config sync: ' + state.configTarget : 'Config sync: Off');
      if (state.status.detail) parts.push(state.status.detail);
      el.status.textContent = parts.join(' | ');
    }

    function renderProviderList(tool, container) {
      container.textContent = '';
      const providers = state.providers.filter((provider) => provider.tool === tool);
      if (!providers.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No ' + labelTool(tool) + ' providers yet.';
        container.appendChild(empty);
        return;
      }

      for (const provider of providers) {
        const active = state.currentProviderIds[tool] === provider.id;
        const item = document.createElement('div');
        item.className = 'provider' + (active ? ' active' : '');

        const meta = document.createElement('div');
        meta.className = 'providerMeta';
        const name = document.createElement('div');
        name.className = 'providerName';
        name.textContent = provider.name;
        const model = document.createElement('div');
        model.className = 'providerModel';
        model.textContent = labelModel(provider.modelPolicy);
        meta.appendChild(name);
        meta.appendChild(model);
        if (!provider.hasKey) {
          const warning = document.createElement('div');
          warning.className = 'providerWarning';
          warning.textContent = 'Key missing on this machine';
          meta.appendChild(warning);
        }
        item.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'rowActions';
        if (active) {
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = 'Active';
          actions.appendChild(badge);
        }
        const applyButton = document.createElement('button');
        applyButton.className = active ? '' : 'primary';
        applyButton.textContent = 'Apply';
        applyButton.disabled = busy || !provider.hasKey;
        applyButton.addEventListener('click', () => post({ type: 'setCurrentProvider', providerId: provider.id }));
        actions.appendChild(applyButton);
        if (!provider.hasKey) {
          const keyButton = document.createElement('button');
          keyButton.className = 'primary';
          keyButton.textContent = 'Set Key';
          keyButton.disabled = busy;
          keyButton.addEventListener('click', () => post({ type: 'setProviderKey', providerId: provider.id }));
          actions.appendChild(keyButton);
        }
        const modelButton = document.createElement('button');
        modelButton.textContent = 'Model';
        modelButton.disabled = busy || !provider.hasKey;
        modelButton.addEventListener('click', () => post({ type: 'updateProviderModel', providerId: provider.id }));
        actions.appendChild(modelButton);
        item.appendChild(actions);
        container.appendChild(item);
      }
    }

    function fetchModels() {
      const tool = el.tool.value;
      const baseUrl = el.baseUrl.value.trim();
      const key = el.apiKey.value;
      if (!baseUrl || !key) {
        showNotice('URL and key are required before fetching models.', true);
        return;
      }
      post({ type: 'previewModels', tool, baseUrl, key });
    }

    function renderModelOptions() {
      el.modelSelect.textContent = '';
      if (!fetchedModels.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No models found';
        el.modelSelect.appendChild(option);
        el.modelSelect.disabled = true;
        updateSaveState();
        return;
      }
      for (const model of fetchedModels) {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.displayName ? model.id + ' - ' + model.displayName : model.id;
        el.modelSelect.appendChild(option);
      }
      el.modelSelect.disabled = false;
      updateSaveState();
    }

    function saveProvider() {
      const payload = {
        tool: el.tool.value,
        name: el.providerName.value.trim(),
        baseUrl: el.baseUrl.value.trim(),
        key: el.apiKey.value,
        model: el.modelSelect.value,
        applyNow: el.applyNow.checked
      };
      if (!payload.name || !payload.baseUrl || !payload.key || !payload.model) {
        showNotice('Name, URL, key, and selected model are required.', true);
        return;
      }
      post({ type: 'createProvider', payload });
    }

    function resetModels() {
      fetchedModels = [];
      el.modelSelect.textContent = '';
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Fetch models first';
      el.modelSelect.appendChild(option);
      el.modelSelect.disabled = true;
      updateSaveState();
    }

    function updateActionState() {
      el.openClaudeButton.disabled = busy || !findCurrent('claude');
      el.openCodexButton.disabled = busy || !findCurrent('codex');
      el.viewClaudeConfigButton.disabled = busy;
      el.viewCodexConfigButton.disabled = busy;
    }

    function updateSaveState() {
      el.saveButton.disabled = busy || !el.modelSelect.value;
    }

    function setBusy(nextBusy) {
      busy = nextBusy;
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        button.disabled = nextBusy;
      }
      render();
    }

    function findCurrent(tool) {
      const id = state.currentProviderIds[tool];
      return state.providers.find((provider) => provider.id === id);
    }

    function labelTool(tool) {
      return tool === 'claude' ? 'Claude Code' : 'Codex';
    }

    function labelModel(policy) {
      if (!policy || policy.type === 'toolDefault') return 'Tool default';
      if (policy.type === 'providerAuto') return policy.preferred ? 'Auto: ' + policy.preferred : 'Auto';
      return policy.model || 'Unknown';
    }

    function labelStatus(kind) {
      if (kind === 'missingKey') return 'Key missing';
      if (kind === 'modelsStale') return 'Models stale';
      if (kind === 'degraded') return 'Degraded';
      if (kind === 'ready') return 'Ready';
      return 'Off';
    }

    function post(message) {
      vscode.postMessage(message);
    }

    function showNotice(message, isError) {
      el.notice.textContent = message;
      el.notice.classList.toggle('error', isError);
      el.notice.classList.add('visible');
      window.setTimeout(() => el.notice.classList.remove('visible'), isError ? 7000 : 3500);
    }

    resetModels();
    post({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

export async function toSidebarSummary(
  provider: ProviderProfile,
  hasSecret: (provider: ProviderProfile) => Promise<boolean>
): Promise<SidebarProviderSummary> {
  return {
    id: provider.id,
    name: provider.name,
    tool: provider.tool,
    baseUrl: provider.baseUrl,
    modelPolicy: provider.modelPolicy,
    hasKey: await hasSecret(provider)
  };
}
