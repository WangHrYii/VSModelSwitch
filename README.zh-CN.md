# VSModelSwitch

[English](README.md) | 简体中文

**VSModelSwitch: VSCode 里的 AI CLI Provider 切换器。**

VSModelSwitch 是一个 VSCode 插件，用来在 VSCode 内管理 Claude Code 和 Codex 的 provider、URL、API key 和模型。它适合经常在不同 API 网关、模型供应商、代理服务和本地测试环境之间切换的 AI 编程用户。

## 功能

- 分别管理 Claude Code 和 Codex provider
- 从 provider endpoint 自动获取模型列表
- 从模型列表中选择模型，不需要手动输入模型名
- 每个 provider 一行显示，支持快速 `Apply`
- 每个 provider 支持重新拉取模型并切换模型
- VSCode 状态栏分别显示 Claude 和 Codex 当前 provider / model
- 监听配置文件变化，外部修改后自动刷新状态栏
- API key 使用 VSCode SecretStorage 本机保存
- provider 元数据支持 VSCode 账号同步
- 同步到新机器后显示 `Key missing`，可用 `Set Key` 补本机 key
- 支持不含密钥的 public config 导入/导出
- 默认写入 sandbox 配置目录，不会误改真实 `~/.claude` / `~/.codex`

## 当前支持

- Claude Code
- Codex

## 安全默认值

开发阶段默认写入 sandbox：

```text
<workspace>/.vsmodelswitch-home
```

默认不会修改真实配置：

```text
~/.claude/settings.json
~/.codex/config.toml
```

只有显式设置后才会写真实配置：

```json
{
  "vsmodelswitch.configTarget": "real"
}
```

## 本地开发

安装依赖：

```bash
npm install
```

编译：

```bash
npm run compile
```

启动 mock 模型服务：

```bash
npm run mock:models
```

测试 endpoint：

```text
http://localhost:8787
```

测试 key：

```text
test-key
```

在 VSCode 中调试：

1. 打开项目目录
2. 按 `F5`
3. 在 Extension Development Host 窗口中点击 VSModelSwitch 侧边栏图标
4. 添加 Claude Code 或 Codex provider
5. 点击 `Fetch Models`
6. 选择模型并保存
7. 点击 provider 行上的 `Apply`

## 打包

```bash
npm run package
```

会生成：

```text
vsmodelswitch-0.0.1.vsix
```

## 配置项

```json
{
  "vsmodelswitch.globalCliSync": true,
  "vsmodelswitch.configTarget": "sandbox",
  "vsmodelswitch.testHome": "",
  "vsmodelswitch.anthropicVersion": "2023-06-01"
}
```

## 说明

状态栏优先读取当前有效配置文件，并用 `baseUrl + model` 匹配已保存 provider。若外部插件只在运行时内存中切换模型、没有写入配置文件或提供可读取 API，VSModelSwitch 无法可靠读取该内存状态。

## License

MIT
