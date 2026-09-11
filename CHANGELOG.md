# 更新日志

本文件记录本插件的所有重要变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 计划中

- 接入 harness locale 命名空间，让按钮与错误文案支持中英双语。
- 补工具行截图与三态演示（`docs/evidence-*.png`）。

## [0.2.0] — 2026-09-11

首个公开整理版本：把可用性修复与仓库化一起落地。

### 新增

- 三态按钮：空闲（四角星）→ 优化中（转圈，可取消）→ 完成（撤回箭头，可还原原文）；不再产生任何额外提示框或提示条。
- 离线回归测试 `test/harness.mjs`：模拟外壳加载客户端 bundle，并断言"四个候选插槽里恰好一个渲染出按钮"。
- 官方接口契约检查 `types/contract.ts`：用发布的 `d.ts` 做编译期断言（插件形状、设置 schema、插槽 key、组件 props、`GenerateOptions` 字段）。
- `scripts/verify-lib.mjs` + `.github/workflows/ci.yml`：校验提交的 `lib/` 与 `src/` 同步，并跑契约检查与回归。
- 运行时诊断：客户端状态挂在 `window.__dshPromptPolish`（`stage` / `attempts` / `mounted` / `errors`）。
- 撤回窗口接入宿主设置（客户端 `settingsScope` 镜像读取 `undoWindowMs`，读不到时 60 秒兜底）。
- 说明文档：`README.md` / `README.zh-CN.md` / `docs/compatibility.md` / `CONTRIBUTING.md` / `examples/`。

### 修复

- **客户端 bundle 缺少 JSX runtime**：构建改用 automatic runtime。此前 classic runtime 会引用未定义的全局 `React`，外壳静默吞掉 `React is not defined`，表现为"注册成功但按钮永不出现"。
- **严格 scope 下读取未声明的服务**：inject 回调里的 scope 只暴露已声明服务，读 `modelDirectories` 会抛错并中断整个回调。现在只声明 `slots`，其余服务读取全部受保护，失败只记诊断。
- **自定义 inject face 的 hooks 在外壳下不渲染**：改为最小注册形态（`name` / `id` / `order`），组件只用 session 作用域标准 props；当前模型改由宿主按"会话请求头 → 默认模型"兜底解析。
- **多插槽同时注册产生两个按钮**：改为逐个尝试候选插槽（`conversation.input.right` 优先，落在模型名紧邻左侧），并用挂在 `globalThis` 的标记保证同一页面只注册一次（bundle 可能被求值两次）。
- **构建产物不可复现**：产物头部的时间戳改为源码内容哈希——相同源码产出逐字节一致的产物，使 `verify:lib` 成为可能，同时任何源码改动仍会改变服务端给的 `rev`。
- **类型漂移**：`z.union(STRINGS)` 曾把 `strength` 退化成 `string`（schema 与配置类型不匹配）；宿主半缺少包级声明合并，`ctx.settings` / `ctx.webServer` 在类型层面不存在；`resolveConfig` 引用了不存在的字段；客户端 `subscribe` 声明成零参函数与 DOM `EventListener` 不兼容。以上均已修正。
- **npm 安装体验**：新增 `prepare` 钩子（`npm publish` 前会先构建两半），`pnpm pack` 得到的 tarball 自带 `lib/`。

### 变更

- `pnpm run check` 现在包含 `verify:lib`；顺序为 build → typecheck → test → verify。
- 配置默认值说明澄清：组合层 `cordis.patch.yml` 已钉住 `enabled`、`temperature`、`maxOutputTokens`、`timeoutMs`、`maxInputChars` 五项。

## [0.1.0] — 2026-09-10

### 新增

- 插件骨架：`dsh.bundle.patch` 组合层 + 宿主半（设置命名空间、`POST /api/prompt-polish/optimize`、模型路由解析、`ctx.llm.stream` 调用）+ 浏览器半（输入框按钮）。
- 设置命名空间 `prompt-polish`：总开关、力度（保守/均衡/激进）、温度、token 与字数上限、超时、自定义策略提示词与组合方式、撤回窗口。
- 输入守卫与失败语义：空输入、只有附件、超长、含 chip、非 `plain` 状态一律拒绝；失败不修改草稿；截断结果拒绝写回。
