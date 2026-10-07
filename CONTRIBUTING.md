# 贡献指南

## 开发流程

```sh
pnpm install
pnpm run check      # typecheck + 离线回归 + 构建
```

> **同时用 Windows 和 WSL 开发时**：这个 checkout 的两条路径（`D:\dsh-prompt-polish`
> 与 `/mnt/d/dsh-prompt-polish`）指向同一份目录，两边共用一个 `node_modules`。
> `pnpm-workspace.yaml` 的 `supportedArchitectures` 已声明同时装 win32 与 linux 的 x64
> 产物；删掉它后装的那一侧会报
> `You installed esbuild for another platform than the one you're currently using`。
> 改动依赖后建议两边各跑一次 `pnpm run check`。

改动后需要：`pnpm run build` → 重启 dsh web 进程 → 刷新页面。
如果本地开发副本的 `package.json#name` 与本仓库不同（例如装成 `dsh-prompt-polish`），
构建要用 `node scripts/build.mjs --client-id <那个名字>`，否则外壳会报下面的约束 7。

## 目录约定

| 路径 | 作用 |
|---|---|
| `src/index.ts` | 宿主半入口（Cordis 插件：`name` / `inject` / `apply`） |
| `src/enhancer.ts` | 模型调用的全部细节（超时、取消、终止原因、清洗） |
| `src/prompts.ts` | 提示词模板与输出清洗，纯函数，可被两半共享 |
| `src/config.ts` | schemastery schema、默认值、输入体检 |
| `src/protocol.ts` | 线协议；只放类型与常量，保证能安全打进两半 |
| `src/client/index.tsx` | 浏览器半：三态按钮、撤回、插槽注册、诊断 |
| `types/contract.ts` | 官方接口契约检查（编译期断言，不参与打包） |
| `test/harness.mjs` | 离线回归：模拟外壳加载 client bundle 并断言渲染结果 |

## 硬性约束（踩过坑，务必保留）

1. **浏览器半用 automatic JSX runtime**：`scripts/build.mjs` 的 `jsx: 'automatic'` 不能删。
   classic runtime 会引用未定义的全局 `React`，外壳静默吞错，表现为按钮不出现。
2. **只声明真正需要的服务**：inject 回调里的 scope 是严格代理，读未声明的服务会抛错并中断回调。
3. **客户端只用标准 props**：不要用"自定义 inject face 的 hooks"传递数据，部分第三方外壳不渲染这类注册。
4. **只注册一次**：注册标记必须挂在 `globalThis`（bundle 可能被求值两次，模块作用域会有两份）。
5. **不要信任单一插槽**：`conversation.input.*` 由 composer 渲染时声明，插件加载可能更早；
   保持"逐个尝试候选插槽"的结构。
6. **模型输出必须校验终止原因**：`error` / `aborted` / `max-tokens` 一律判失败，
   绝不把半截提示词写回输入框。
7. **客户端 bundle 的信封 id 必须等于被安装的那份 `package.json` 的 `name`**：
   dsh 按这个 id 建客户端模块图的行（`nearestPackage()` 取安装目录里最近的 package.json）。
   两者不一致时加载器会回退到单文件 URL 二次执行 bundle，外壳抛
   `client-modules: duplicate factory registration for "…"（bundle executed twice without
   invalidate?）`。装到别的名字下请 `--client-id <那个名字>`，或直接在安装目录里构建。
8. **`@deepseek-ai/dsh*` 的 peer range 必须接纳运行中的 dsh 版本**：dsh 0.2.0-rc.1 的
   app-boot 用 `peerDependencies` 做门禁（`evaluatePluginCompatibility`），不满足就把整个
   bundle 丢进 `skippedBundles`——**静默跳过，控制台没有报错**。坑在预发布版本：
   `^0.1.7-rc.1` = `>=0.1.7-rc.1 <0.2.0`，**永远不包含 `0.2.0-rc.1`**，加不加
   `includePrerelease` 都一样。支持多条 dsh 线时必须显式写全，例如
   `^0.1.7-rc.1 || ^0.2.0-rc.1`；升级 `devDependencies` 里的 dsh 版本时，务必同步放宽
   `peerDependencies`，并让 `pnpm run check`（含 `test/dsh-compat.test.mjs`）通过。

## 提交前

- `pnpm run check` 必须全绿；
- 新增对外行为请同步更新 `README.md` / `README.zh-CN.md` 与 `docs/compatibility.md`；
- 提交信息用祈使句，说明"做了什么"，必要时补一句"为什么"。
