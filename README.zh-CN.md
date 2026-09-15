# 提供商拓展插件 · Provider Extension

[English](README.md)

`dsh-provider-extension` 是面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的**非官方社区插件**，负责在 DSH Desktop 中接管输入区的提供方座位，并为每个提供方承载一个独立接入模块。

> 本项目不隶属于 DeepSeek，也未获得 DeepSeek 官方背书。DeepSeek Harness 及相关名称归各自权利人所有。

本项目此前名为 `dsh-model-panel`，安装器会自动迁移旧安装。

## 提供方接入状态

| 提供方 | 状态 | 插件提供的能力 |
| --- | --- | --- |
| ChatGPT / Codex 订阅（`dsh-codex-subscription` 2.x） | **已实现** | 列出全部已保存账号、切换真实活动账号、显示每个账号的周余额 |
| OpenAI GPT（API） | 计划中 | — |
| Google Gemini | 计划中 | — |
| OpenCode | 计划中 | — |

每个提供方在 `src/client/providers/` 下拥有独立模块。未实现并在真实 DSH 窗口验收之前，不会宣称已接入。

## 功能

- 使用 DSH 每个会话的权威 `ModelDirectory`，不复制模型目录。
- 覆盖自带的 `conversation.input.model` 视觉座位，同时保留其权威服务和 `/model` 命令。
- 只呈现两个模型相关控件：先选择提供方/账号，再选择模型与推理等级。
- 把所选提供方的模型显示为带独立强调色的推理等级滑杆，并显示当前模型声明的推理等级按钮。
- 没有推理档位的模型仍然可以选择。
- 选择普通提供方只改变正在浏览的目录分组；只有继续选择模型后，才会改变会话的实际模型。
- 后端不支持上下文窗口选择时明确说明，不提供虚假的 256K/512K/1M 按钮。

### ChatGPT / Codex 订阅账号

- 每个已保存账号都列在对应提供方下，显示账号标签、脱敏邮箱和活动标记。
- 分组标题显示账号数量，而不是模型数量。
- 选择账号会调用订阅插件经过认证的 `account/select` RPC、刷新额度控件并重新加载模型目录；OAuth 凭据不会进入本插件。
- 打开列表时自动读取**当前活动账号**的周余额。
- 上游 `usage` 接口只报告活动账号，因此其他账号的余额按需读取：插件临时切到该账号读取后立即切回；切回失败会明确报错，不会静默改变你的活动账号。

## 兼容性

已在 **DSH Desktop v2.0.9** 中验证，并按公开的 `0.1.2-rc.1` DSH 包契约构建。这些仍是预发布接口，因此较新的 Desktop 版本可能需要更新插件。

当前选择请求只包含：

```ts
{ provider: string, model: string, reasoningEffort?: string }
```

真正的上下文预算还需要 Host 请求准备、持久化、提供方支持和压缩策略接入；插件不会把目录元数据误当成已打通的后端能力。

## 安装

需要：已经初始化 `desktop` profile 的 DSH Desktop、Git 和 Node.js 20 或更高版本。

```powershell
git clone https://github.com/forestbiankiii/dsh-provider-extension.git
cd dsh-provider-extension
node scripts/profile.mjs install
```

仓库已提交预构建的 `lib/index.js` 和 `lib/client.js`，安装时**不需要**运行 `npm install`，也不需要本地编译器。

安装器会：

1. 从依赖、bundle、patch row 和运行副本中清除所有旧包名（`dsh-model-panel`、`@dshx/client-ui-model-panel`）；
2. 把白名单内的运行文件复制到 `~/.dsh/local-plugins/dsh-provider-extension`；
3. 在 `~/.dsh/profiles/desktop/package.json` 声明本地 file 依赖；
4. 把运行副本放入该 profile 的 `node_modules`，确保能够解析；
5. 在 `dsh.profile.bundles` 中只加入一次 `dsh-provider-extension`；
6. 清理用户 patch 中遗留或手工添加的 `provider-extension`、`model-panel` row，避免 bundle 被注册两次；
7. 修改前备份以上两个 profile 文件。

它不会修改应用安装目录或 `app.asar`。若数据目录或 profile 不同：

```powershell
node scripts/profile.mjs install --dsh-home D:\path\to\.dsh --profile desktop
```

随后必须**完全退出并重新启动 DSH Desktop**。仅刷新页面不会重建组合后的插件行。

## 更新

在已克隆的仓库中执行：

```powershell
git pull --ff-only
node scripts/profile.mjs install
```

然后重启 DSH Desktop。重复运行安装器是幂等的，并会重新创建备份。

从 `dsh-model-panel` 升级不需要额外步骤：运行安装器就会完成迁移，包括删除旧的运行副本。

## 卸载

在已克隆的仓库中执行：

```powershell
node scripts/profile.mjs uninstall
```

然后重启 DSH Desktop。卸载器只删除本插件的精确依赖、bundle 条目、遗留或手工 patch row 和运行副本，并保留修改前备份。

## 开发

```powershell
npm ci
npm run check
```

`npm run check` 会进行严格 TypeScript 检查，运行组件、策略和安装器测试，重新构建 DSH client-module，并检查可发布包。独立构建器使用 esbuild 与 Lightning CSS，外置由 DSH 提供的运行模块，并用 `window.__ModuleLoader__.load(...)` 包装浏览器产物。

UI 与运行行为修改必须遵守 [CONTRIBUTING.md](CONTRIBUTING.md) 中的真实窗口验收门禁：先在本地安装候选版本，让需求方在当前 DSH Desktop 窗口试用，收到明确确认后才允许 push、打 tag 或发布 Release。

## 结构

- `src/index.ts`：Cordis Loader 需要的空 Host 载体。
- `src/client/index.ts`：客户端注册和具备生命周期的样式注入。
- `src/client/ProviderPanel.tsx`：composer 按钮、弹层、滑杆和无障碍行为。
- `src/client/providers/codex.ts`：ChatGPT/Codex 订阅账号名册、账号切换与额度读取。
- `src/client/selection.ts`：纯模型/推理档位选择策略。
- `cordis.patch.yml`：注册 `provider-extension` 行的 bundle patch。
- `scripts/profile.mjs`：先备份后修改的 profile 安装/卸载器与改名迁移。
- `lib/client.js`：DSH 实际加载的预构建浏览器产物。

插件声明 `sessions`、`remote` 与 `remote.session`，因为 `modelDirectories.directoryFor(sessionId)` 会通过调用方的 Cordis 上下文读取这些服务。

## 隐私与安全

插件只读取当前会话的模型目录状态，并调用既有 `load`/`select` 方法；另外会读取 `dsh-codex-subscription` 2.x 提供的无密钥账号名册，并调用该插件自己的认证接口完成账号切换与额度读取。它不读取提示词、消息、文件或凭据，不发起独立第三方请求，也没有遥测。详见 [SECURITY.md](SECURITY.md)。

## 许可证

[MIT](LICENSE)
