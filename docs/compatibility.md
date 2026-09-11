# 接口核对与兼容性

本文记录插件用到的每个官方接口、核对方式与已知的兼容性边界。核对基于 npm 上发布的
`0.1.5-rc.1` 类型定义，通过 `types/contract.ts` 在编译期断言（`pnpm run typecheck`）。

## 核对方式

`types/contract.ts` 不复制官方类型，而是直接引用真实 `d.ts` 并做编译期断言：

- 宿主插件形状：`name` 为字符串、`inject` 为字符串数组、`apply(ctx: Context, config?)` 可被 `ctx.plugin` 直接挂载；
- 设置命名空间：`Config` 必须是 schemastery 的 `z<Config>`，默认值必须完整覆盖配置类型；
- 客户端插槽：目标插槽 key 必须真实存在于官方 `SlotMap`，且
  `conversation.input.right` 确实是 `{ kind: 'list', scope: 'session' }`；
- 组件 props：我们声明的每个 prop 都必须存在于官方 `PropsRuntime<'conversation.input.right'>`；
- 模型调用：传给 `ctx.llm.stream` 的字段必须全部是官方 `GenerateOptions` 的已知字段。

任何官方签名变动都会先让这个文件编译失败，而不是等到运行时才发现。

## 用到的官方接口

| 位置 | 接口 | 用法 | 核对结果 |
|---|---|---|---|
| 宿主 | `ctx.settings.register(ns, schema, { base, applies })` | 占用 `prompt-polish` 命名空间 | ✅ 签名与返回的 `scope.get()` 一致 |
| 宿主 | `ctx.effect(fn, label)` | 挂载路由并随插件卸载回收 | ✅ |
| 宿主 | `ctx.get('webServer')` → `webServer.register({ kind:'exact', path, handler })` | 注册 `/api/prompt-polish/optimize` | ✅ `register` 返回 disposer；重复路径会抛错，我们只注册一次 |
| 宿主 | `ctx.get('llm')` → `llm.stream(GenerateOptions)` | 一次性优化调用 | ✅ 字段全部合法（见上） |
| 宿主 | `ctx.get('sessions')` → `session.requestHeader()` | 读取会话最近使用的模型路由（可选依赖） | ✅ 属性/方法两种形态都兼容，异常降级 |
| 宿主 | `ctx.get('settings').get('agent-default-model')` | 跨进程默认模型（可选依赖） | ✅ |
| 宿主 | `BlockAssembler` / `createUserMessage` | 组装流式输出与用户消息 | ✅ |
| 客户端 | `slots.inject(key, callback)` | 等插槽被声明后注册 | ✅ 回调返回 disposer；插槽不存在时不回调（因此逐个尝试候选插槽） |
| 客户端 | `slots.register({ name, id, order }, Component)` | 注册按钮 | ✅ 最小形态；不使用自定义 inject face |
| 客户端 | session 标准 props `useInput` / `inputActions.setDraft` | 读/写草稿 | ✅ 见下方"实测结论" |

## 实测结论（写进设计的原因）

1. **不要读未声明的服务**：inject 回调里的 scope 是严格代理，未在 `inject` 声明的服务
   直接属性访问会抛 `cannot get property "X" without inject`，并且**整个回调会被外壳吞掉**。
   插件因此只声明 `slots`，其余服务读取全部包在 try/catch 里。
2. **不要用自定义 inject face 传 hooks**：部分第三方外壳（实测 `@linxin666/dsh-web-all`）
   会调用注入面却不渲染组件，表现为"注册成功但按钮永不出现"。插件因此只用标准 props。
3. **插槽声明有时序**：`conversation.input.left/right` 由 composer 渲染时声明，
   插件加载可能早于它；`slots.inject` 的回调此时不会执行。插件逐个尝试候选插槽并设超时兜底。
4. **bundle 可能被求值两次**：连续注册会产生两个按钮。插件把"只注册一次"的标记挂在
   `globalThis`（`Symbol.for`）上，而不是模块作用域。
5. **网络信任**：宿主路由位于 `/api` 前缀下，由 `dsh-client-connection` 的 API 网关统一
   施加 Host/Origin 栅栏与浏览器鉴权（未通过时 403/401）。把路由改到 `/api` 之外会失去这层保护。

## 客户端服务与 `dsh.client.inject`

浏览器半在运行时只消费两个服务：

| 服务 | 必需性 | 用途 |
|---|---|---|
| `slots` | 必需（在模块的 `inject` 里声明） | `slots.inject(key, cb)` 等插槽声明 + `slots.register(options, Component)` 注册按钮 |
| `settingsScope` | 可选（用 `ctx.inject` 探测） | `bind({ namespace: 'prompt-polish' })` 读取并订阅 `undoWindowMs` |

`package.json` 里的 `dsh.client.inject` 是给**客户端包图**排序用的（例如某个 UI 包必须排在
`dsh-client-ui-slots` 之后），本插件的 bundle 不 import 任何客户端包，因此该数组刻意留空——
它和服务声明是两套不同的东西。

## 已知边界

| 项 | 说明 |
|---|---|
| 撤回窗口配置 | 已接入：客户端用 `settingsScope.bind({ namespace })` 读 `undoWindowMs` 并订阅变化，读不到设置服务时退回 60 秒 |
| 上下文感知 | 不读取会话历史，只优化当前草稿（默认更省更可预期） |
| 输入含 `/命令`、`@引用` | 直接拒绝（结构化片段不适合整体改写） |
| 只读附件 | 只有附件、没有正文时按空输入拒绝 |
| dsh 版本 | 依赖 `conversation.input.*` 插槽与 `ctx.llm.stream` 的 0.1.5 线；更早版本未验证 |
