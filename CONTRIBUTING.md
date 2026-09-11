# 贡献指南

## 开发流程

```sh
pnpm install
pnpm run check      # typecheck + 离线回归 + 构建
```

改动后需要：`pnpm run build` → 重启 dsh web 进程 → 刷新页面。

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

## 提交前

- `pnpm run check` 必须全绿；
- 新增对外行为请同步更新 `README.md` / `README.zh-CN.md` 与 `docs/compatibility.md`；
- 提交信息用祈使句，说明"做了什么"，必要时补一句"为什么"。
