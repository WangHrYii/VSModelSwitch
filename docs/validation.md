# VSModelSwitch Validation Guide

This project can be validated locally without publishing to the VSCode Marketplace.

## 1. Compile

```bash
npm install
npm run compile
```

Expected result:

- TypeScript compilation completes without errors.
- `out/` contains the compiled extension.

## 2. Start Mock Model Server

```bash
npm run mock:models
```

Use this endpoint in the extension:

```text
http://localhost:8787
```

Use any non-empty API key:

```text
test-key
```

The mock server supports:

```text
GET /v1/models
GET /models
```

## 3. Run Extension Development Host

In VSCode:

1. Open this folder.
2. Press `F5`.
3. A new Extension Development Host window opens.
4. Click the VSModelSwitch icon in the Activity Bar.
5. Use the side bar Providers UI.

Add a provider:

```text
Tool: Claude Code
Name: Local Mock
Base URL: http://localhost:8787
Key: test-key
Click Fetch Models
Model: choose claude-sonnet-4-20250514
Apply after saving: checked
Save Provider
```

Add another provider:

```text
Tool: Codex
Name: Local Mock Codex
Base URL: http://localhost:8787
Key: test-key
Click Fetch Models
Model: choose gpt-5-codex
Apply after saving: checked
Save Provider
```

Expected result:

- Model fetch succeeds.
- The Claude Code provider list shows `Local Mock` as active.
- The Codex provider list shows `Local Mock Codex` as active.
- Each provider is displayed as one compact row with name, model, and row-level actions.
- Non-active providers show `Apply`; active providers show `Active`.
- The row-level `Model` button fetches models for that provider and lets you choose a new model.
- `Config` is a tool-level button next to the Claude Code / Codex section header.
- The VSCode status bar shows separate Claude and Codex entries with provider/model.
- If the sandbox config file is edited externally, the status bar should update after the file watcher fires.

To validate synced-provider behavior:

1. Export a public config.
2. Import it in a fresh Extension Development Host profile or after clearing secrets.
3. Provider rows should show `Key missing on this machine`.
4. Click `Set Key`.
5. Enter `test-key`.
6. `Apply` and `Model` should become available again.
- Global config sync is enabled by default, but writes to sandbox by default.
- The default sandbox path is `<workspace>/.vsmodelswitch-home`.
- Real `~/.claude` and `~/.codex` are not touched unless `vsmodelswitch.configTarget` is set to `real`.

The Command Palette commands still work, but the side bar UI is the primary flow.

## 4. Validate Terminal Env

Click `Terminal` in the corresponding provider group to apply and open a terminal, or run:

```text
VSModelSwitch: Apply Current Provider
```

Then open a normal new terminal and check:

```bash
echo $ANTHROPIC_BASE_URL
echo $ANTHROPIC_AUTH_TOKEN
echo $OPENAI_BASE_URL
echo $OPENAI_API_KEY
```

Expected:

```text
http://localhost:8787
test-key
http://localhost:8787
test-key
```

Click `Claude Terminal` in the side bar, or run:

```text
VSModelSwitch: Open Claude Terminal
```

In the created terminal:

```bash
echo $ANTHROPIC_BASE_URL
echo $ANTHROPIC_AUTH_TOKEN
```

Expected:

```text
http://localhost:8787
test-key
```

Click `Codex Terminal` in the side bar, or run:

```text
VSModelSwitch: Open Codex Terminal
```

In the created terminal:

```bash
echo $OPENAI_BASE_URL
echo $OPENAI_API_KEY
```

Expected:

```text
http://localhost:8787
test-key
```

The command also sends `claude` or `codex` automatically. For pure env testing, interrupt that command and run the `echo` checks.

## 5. Validate Safe Global CLI Sync

By default, config files are written under:

```text
<workspace>/.vsmodelswitch-home/.claude/settings.json
<workspace>/.vsmodelswitch-home/.codex/config.toml
```

To use a custom sandbox path, set workspace settings in the Extension Development Host:

```json
{
  "vsmodelswitch.globalCliSync": true,
  "vsmodelswitch.testHome": "/tmp/vsmodelswitch-home"
}
```

Click `Use` on a provider card or open a terminal to apply the active provider, or run:

```text
VSModelSwitch: Apply Current Provider
```

Expected files:

```text
/tmp/vsmodelswitch-home/.claude/settings.json
/tmp/vsmodelswitch-home/.codex/config.toml
```

No real files under your actual home directory should be touched.

You can also click `Config` in each provider group to open the generated file directly.

Only set this after you are ready to write real machine config:

```json
{
  "vsmodelswitch.configTarget": "real"
}
```

## 6. Validate Public Import/Export

Click `Export` and `Import` in the VSModelSwitch side bar, or run:

```text
VSModelSwitch: Export Public Config
VSModelSwitch: Import Public Config
```

Expected:

- Exported JSON contains provider metadata.
- Exported JSON does not contain API keys.
- After importing on another machine, status should indicate missing key until local keys are entered.

## 7. Package VSIX

```bash
npm run package
```

Expected:

- A `.vsix` file is generated.
- It can be installed from VSCode with `Extensions: Install from VSIX...`.
