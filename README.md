# VSModelSwitch

English | [简体中文](README.zh-CN.md)

**VSModelSwitch: an AI CLI provider switcher for VSCode.**

VSModelSwitch is a VSCode extension for managing Claude Code and Codex providers, API endpoints, API keys, and models from a side-bar UI. It is built for AI coding users who frequently switch between API gateways, model vendors, proxies, and local test environments.

## Features

- Manage Claude Code and Codex providers separately
- Fetch model lists from provider endpoints
- Choose models from fetched lists instead of typing model names manually
- Show each provider as one compact row with quick `Apply`
- Refresh and change the model for each provider
- Show separate Claude and Codex provider/model status items in the VSCode status bar
- Watch config file changes and refresh status automatically
- Store API keys locally with VSCode SecretStorage
- Sync provider metadata with VSCode account sync
- Show `Key missing` and `Set Key` for synced providers without local secrets
- Import and export public config without secrets
- Write to a sandbox config home by default, avoiding accidental changes to real `~/.claude` and `~/.codex`

## Supported Tools

- Claude Code
- Codex

## Safe Defaults

During development, VSModelSwitch writes CLI config files into a sandbox home by default:

```text
<workspace>/.vsmodelswitch-home
```

It does not touch real machine config files by default:

```text
~/.claude/settings.json
~/.codex/config.toml
```

To write real machine config, explicitly set:

```json
{
  "vsmodelswitch.configTarget": "real"
}
```

## Local Development

Install dependencies:

```bash
npm install
```

Compile:

```bash
npm run compile
```

Run in VSCode:

1. Open this folder in VSCode.
2. Press `F5`.
3. In the Extension Development Host window, click the VSModelSwitch Activity Bar icon.
4. Add a Claude Code or Codex provider.
5. Click `Fetch Models`.
6. Choose a model and save.
7. Click `Apply` on a provider row.

See `docs/validation.md` for the full local validation checklist.

## Mock Endpoint

Start the mock model server:

```bash
npm run mock:models
```

Use this endpoint for both Claude Code and Codex during testing:

```text
http://localhost:8787
```

Use any non-empty key, for example:

```text
test-key
```

## Settings

```json
{
  "vsmodelswitch.globalCliSync": true,
  "vsmodelswitch.configTarget": "sandbox",
  "vsmodelswitch.testHome": "",
  "vsmodelswitch.anthropicVersion": "2023-06-01"
}
```

## Packaging

```bash
npm run package
```

## Notes

The status bar is based on the currently readable config files and matches saved providers by `baseUrl + model`. If another VSCode extension changes a model only in runtime memory without writing a config file or exposing a readable API, VSModelSwitch cannot reliably read that in-memory state.

## License

MIT
