# 提供商拓展插件 · Provider Extension

[English](README.md)

`dsh-provider-extension` 是面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的**非官方社区插件**，负责在 DSH Desktop 中接管输入区的提供方座位，并为每个提供方承载一个独立接入模块。

> 本项目不隶属于 DeepSeek，也未获得 DeepSeek 官方背书。DeepSeek Harness 及相关名称归各自权利人所有。

本项目此前名为 `dsh-model-panel`，安装器会自动迁移旧安装。

## 提供方接入状态

| 提供方 | 状态 | 插件提供的能力 |
| --- | --- | --- |
| ChatGPT / Codex 订阅（`dsh-codex-subscription` 2.x） | **已实现** | 列出全部已保存账号、切换真实活动账号、显示每个账号的周余额 |
| Antigravity（`dsh-antigravity-auth` 0.1.4-rc.1） | **已实现** | 提供商设置页确认该能力包的风险提示、登录 Google 账号，并列出该账号上报的模型 |
| OpenAI GPT（API） | 计划中 | — |
| Google Gemini | 计划中 | — |
| OpenCode Go | 已实现 | 网关模型、API Key 配置及额度窗口 |
| Claude 订阅（`anthropic-claude-cli`） | 已实现；真实调用待用户登录验证 | 官方 CLI 管理登录、文本流式响应、工具调用回传、模型别名及开关 |

每个提供方在 `src/client/providers/` 下拥有独立模块。未实现并在真实 DSH 窗口验收之前，不会宣称已接入。

Host 接入实现已包含在此 Bundle 中，上游来源和许可证记录在 THIRD-PARTY-NOTICES。不要重复启用占用同一路由的适配器。Antigravity／Codex 凭据保留在各自 Host 模块；Claude 则完全由官方 CLI 管理登录。

## Claude 订阅：通过官方 CLI 接入

先安装未修改的官方 Claude Code CLI 并加入 PATH，重启 DSH，再打开「提供商拓展 → Anthropic Claude」。Windows 上的登录按钮会在可见终端启动官方 `claude auth login`，其他平台请自行执行该命令。完成登录后刷新状态，在输入区选择 Anthropic Claude 和 Sonnet／Opus／Haiku 模型别名。登录及账号切换仍由官方 CLI 管理，本插件不导入、保存、导出或改写其 Token。CLI 也可能使用 API Key／第三方计费，设置页会明确提示。请遵守 [Anthropic 的认证及凭据规则](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)。

适配器借鉴 MIT 项目 [katsos/dsh-claude-cli](https://github.com/katsos/dsh-claude-cli)，固定提交为 `3a3a57f22a3e748c9720a1b96ce64e015f0f9643`。DSH 保留对话记录并执行工具，CLI 内置工具及本地设置不参与，仅由无执行能力的 MCP 桥声明工具；一个模型消息完成后结束 CLI 请求。首版只支持文本，历史以转录形式重建，并非原生角色／思考签名回放；模型别名是参考目录，不保证套餐权限。CLI 未报告的订阅额度／到期日不会伪造，请在官方 CLI 使用 `/usage` 查看，不提取 Token 或发送收费探测消息。

插件 Config 字段：`claudeExecutable`（默认 `claude`）、`claudeStreamIdleTimeoutMs`（默认 `300000`）、`claudeUnsupportedFields`（默认 `error`）。这里的 CLI 无法精确兑现 `temperature`、`maxTokens`、`stop`；请从代理配置移除，或显式设置 `ignore` 才忽略。`claude_channel` 工具只提供状态／模型查询，登录仅限用户界面或终端。安装检测和模拟测试不能替代您的真实登录及模型调用验收。

## 功能

- 使用 DSH 每个会话的权威 `ModelDirectory`，不复制模型目录。
- 覆盖自带的 `conversation.input.model` 视觉座位，同时保留其权威服务和 `/model` 命令。
- 只呈现两个模型相关控件：先选择提供方/账号，再选择模型与推理等级。
- 把所选提供方的模型显示为带独立强调色的推理等级滑杆，并显示当前模型声明的推理等级按钮。
- 没有推理档位的模型仍然可以选择。
- 选择普通提供方只改变正在浏览的目录分组；只有继续选择模型后，才会改变会话的实际模型。
- 后端不支持上下文窗口选择时明确说明，不提供虚假的 256K/512K/1M 按钮。

### 使用统计（与本插件一同安装）

侧边栏「使用统计」覆盖当前 DSH 配置内的全部工作区、会话和子代理，不跨配置同步。页面提供年度活动热力图、用量趋势、渠道／模型／工作区／会话排行，以及耗时、首字延迟、重试和失败统计。页面跟随 DSH 深浅主题，不提供预算提醒或自动限流。

首次打开会在后台从持久化会话日志补齐历史，显示导入进度和读档失败。分叉继承的历史前缀不重复计费；压缩前真实产生的请求仍计入总量。提供商未上报的用量标为缺失，不当作零。

DeepSeek 的充值余额、赠金余额复用 DSH「账号与余额」中的登录，不需要再次提供密钥。现有「查询用量」是平台页面入口，不是账单接口；余额不能代表消费流水。本地金额是按「费率设置」中各渠道、模型的每百万 Token 单价计算的**预估费用**，采用当前配置费率，不还原历史价格。未设置价格或缓存计费信息不足时显示未知；人民币与美元不合并，其他渠道首版不估价。

账号区还会直接读取 Codex 各账号的 5 小时／周额度与提供商 Credits、Antigravity 各账号的分组额度，以及 OpenCode Go 的 Host 用量接口。统计页不切换活动账号，也不向页面发送密钥。当前及非当前账号均使用各自的认证刷新后直接读取，暂无接口的渠道会明确标注；缺少数据不当作满额度或零余额。OpenCode 的上报比例不会猜测为剩余额度。重新进入页面会先显示同一连接上次查询的账号数据，再后台更新；旧查询时间保留至新结果返回，刷新失败会提示旧数据可能过期。仅使用浏览器内存，不写浏览器存储，整页重载后清空。账号数据在进入页面及手动刷新时读取，不受日志筛选影响。`usage_statistics` 新增 `balances` 动作返回同一账号视图；旧 `balance` 动作仍只查询 DeepSeek。

账号卡片支持拖动把手排序，聚焦把手后也可用方向键。“选择显示卡片”提供各账号的复选框和上下箭头，卡片右上角亦可直接隐藏；“恢复默认布局”重置顺序和显示状态。本浏览器仅保存卡片标识及显示偏好，不保存余额、账号标签或 Token。新账号自动追加，刷新不打乱已保存顺序；隐藏卡片不改变登录状态或提供商查询。

统计缓存由 DSH 会话投影管理，可从日志重建；费率保存在当前配置的宿主存储中。页面与 `usage_statistics` 工具共用报告、余额查询及费率保存操作。统计接口只返回元数据和计量，不返回消息正文或凭据。新增能力要求宿主提供 `sessionQuery`、`sessionProjections` 和 `connection`；费率保存还需 `storageDomain`。

通过 DSH 内置插件管理器安装或升级本 bundle 即包含该页面。替换已加载的包可能要求重启；以安装结果为准，不保证仅刷新页面就加载新的 Host 代码。

### ChatGPT / Codex 订阅账号

- 每个已保存账号都列在对应提供方下，显示账号标签、脱敏邮箱和活动标记。
- 分组标题显示账号数量，而不是模型数量。
- 选择账号会调用订阅插件经过认证的 `account/select` RPC、刷新额度控件并重新加载模型目录；OAuth 凭据不会进入本插件。
- 打开列表时自动读取**当前活动账号**的周余额。
- 现有对话控件／设置中的按需查询仍采用临时切换后立即恢复的流程，恢复失败会明确报错。使用统计页改用按账号 ID 读取的新路径：不切换账号，指定账号请求失败时也不会回退到其他账号的额度。

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

- `src/index.ts`：Host 提供商接入与统计模块挂载入口。
- `src/usage/`：无正文的计量投影、历史回填、报告、DeepSeek 余额与费率存储。
- `src/client/usage/`：统计主页面、侧栏入口、筛选及图表。
- `src/client/index.ts`：客户端注册和具备生命周期的样式注入。
- `src/client/ProviderPanel.tsx`：composer 按钮、弹层、滑杆和无障碍行为。
- `src/client/providers/codex.ts`：ChatGPT/Codex 订阅账号名册、账号切换与额度读取。
- `src/client/selection.ts`：纯模型/推理档位选择策略。
- `cordis.patch.yml`：注册 `provider-extension` 行的 bundle patch。
- `scripts/profile.mjs`：先备份后修改的 profile 安装/卸载器与改名迁移。
- `lib/client.js`：DSH 实际加载的预构建浏览器产物。

插件声明 `sessions`、`remote` 与 `remote.session`，因为 `modelDirectories.directoryFor(sessionId)` 会通过调用方的 Cordis 上下文读取这些服务。

## 隐私与安全

插件包含 Host 提供商接入与 Client UI。使用统计模块通过宿主查询及投影读取会话日志中的计量、模型、时间和关系信息，只向页面返回统计及会话元数据，不返回消息正文或凭据。DeepSeek 余额由宿主账号服务查询，统计不另行读取密钥，也不自动切换其他提供商账号。提供商接入本身可能管理认证并访问对应服务；这与统计模块的权限边界不同。没有新增遥测。详见 [SECURITY.md](SECURITY.md)。

## 许可证

[MIT](LICENSE)
