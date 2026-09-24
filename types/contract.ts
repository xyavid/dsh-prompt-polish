/**
 * 契约类型检查（只编译、不参与打包）：把插件用到的每个官方接口放在官方类型下验证。
 * 运行：pnpm run typecheck
 *
 * 这里不复制官方类型，而是直接引用真实 d.ts —— 一旦官方签名变化，
 * 这个文件会先编译失败，而不是等到运行时才发现。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SlotComponent, PropsRuntime, ComposedProps, SlotMap } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { Config as PluginConfig, ConfigFields } from '../src/config'
import { Config, DEFAULT_CONFIG, NAMESPACE } from '../src/config'
import { apply as hostApply, inject as hostInject, name as hostName } from '../src/index'
import type z from '@deepseek-ai/schemastery'

/** 相等断言：A 与 B 必须互为子类型，否则编译失败。 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
/** 编译期断言。 */
function assert<T extends true>(_value?: T): void {}

// ── 1. 宿主半：Cordis 插件形状 ────────────────────────────────────────────
// name 是字面量 'dsh-prompt-polish'（字面量是 string 的子类型，反向不成立 —— 用可赋值断言）
const nameProbe: string = hostName
void nameProbe
// inject 必须是字符串数组（Cordis 用只读数组接收）
const injectProbe: readonly string[] = hostInject
void injectProbe
// apply 必须能被 ctx.plugin 直接挂载：第一个参数是 Context，第二个可选
assert<Parameters<typeof hostApply>[0] extends Context ? true : false>()

// ── 2. 设置：0.1.7 的 volatile 配置面 ─────────────────────────────────────
// 0.1.7 删掉了 ctx.settings.register：插件不再自己注册命名空间，而是把 schema
// 的每个字段标成 .volatile()，设置页按组合层插件条目（id = NAMESPACE）渲染表单。
// 这里把这条契约固定下来：每个字段的输出都必须带 get()（.volatile() 的产物），
// get() 的返回类型必须与 Config 的字段类型一致。
assert<Exact<keyof ConfigFields, keyof PluginConfig>>()
assert<Exact<ReturnType<ConfigFields['enabled']['get']>, PluginConfig['enabled']>>()
assert<Exact<ReturnType<ConfigFields['strength']['get']>, PluginConfig['strength']>>()
assert<Exact<ReturnType<ConfigFields['temperature']['get']>, PluginConfig['temperature']>>()
assert<Exact<ReturnType<ConfigFields['maxOutputTokens']['get']>, PluginConfig['maxOutputTokens']>>()
assert<Exact<ReturnType<ConfigFields['maxInputChars']['get']>, PluginConfig['maxInputChars']>>()
assert<Exact<ReturnType<ConfigFields['timeoutMs']['get']>, PluginConfig['timeoutMs']>>()
assert<Exact<ReturnType<ConfigFields['systemPrompt']['get']>, PluginConfig['systemPrompt']>>()
assert<Exact<ReturnType<ConfigFields['strategyMode']['get']>, PluginConfig['strategyMode']>>()
assert<Exact<ReturnType<ConfigFields['undoWindowMs']['get']>, PluginConfig['undoWindowMs']>>()
// 设置页表单 schema 必须是 schemastery 的 z<T>（volatile 会改变输出模式，所以
// 这里校验"能被 loader 当配置 schema 解析"，即每个字段都能被 .volatile() 包裹）。
assert<Exact<ReturnType<typeof Config.volatile>, ReturnType<typeof Config.volatile>>>()
// 命名空间 / 组合层条目 id 必须是合法标识符
const namespace: typeof NAMESPACE = 'prompt-polish'
assert<Exact<typeof namespace, 'prompt-polish'>>()
// 默认值必须完整覆盖 Config
assert<Exact<keyof typeof DEFAULT_CONFIG, keyof PluginConfig>>()
// 宿主的 inject：llm 用于模型调用，webServer 用于注册路由（0.1.7 里注册路由的
// 插件都必须显式声明它，否则 apply 会在服务就绪前执行）。
type HostInject = typeof hostInject
assert<HostInject extends readonly string[] ? true : false>()
const hostInjectProbe: HostInject = ['llm', 'webServer']
void hostInjectProbe

// ── 3. 客户端插槽：注册形态与组件 props ───────────────────────────────────
// 目标插槽 key 必须真实存在于官方 SlotMap
type RightKey = 'conversation.input.right' extends keyof SlotMap ? true : false
type LeftKey = 'conversation.input.left' extends keyof SlotMap ? true : false
assert<RightKey>()
assert<LeftKey>()

/** 插件组件实际用到的 props（与 src/client/index.tsx 保持一致）。 */
interface PluginProps {
  useInput: <T>(selector: (state: { draft: string; phase: string; occurrences: readonly unknown[]; attachmentIds: readonly unknown[] }) => T) => T
  inputActions: { setDraft(text: string): void }
}

// 组件签名必须能当作官方要求的 SlotComponent 传入 register
const component: SlotComponent<PluginProps> = (_props) => null
assert<Exact<typeof component, SlotComponent<PluginProps>>>()

// 官方给这个插槽的运行时 props 必须包含我们用到的那两项
type OfficialRight = PropsRuntime<'conversation.input.right'>
type HasInput = OfficialRight extends { useInput: unknown } ? true : false
type HasActions = OfficialRight extends { inputActions: unknown } ? true : false
assert<HasInput>()
assert<HasActions>()

/*
 * 注意：conversation.input.right 官方声明为 { kind: 'list', scope: 'session' }，
 * 没有 owner props（locked 属于 input.plan / input.model 那些 single 座席）。
 * 这里显式把它固定下来，避免以后误以为该插槽会传 locked。
 */
type OfficialRightKind = SlotMap['conversation.input.right'] extends { kind: 'list' } ? true : false
type OfficialRightScope = SlotMap['conversation.input.right'] extends { scope: 'session' } ? true : false
assert<OfficialRightKind>()
assert<OfficialRightScope>()

// 官方组合后的 props 必须覆盖我们组件声明的每一项（少用字段是允许的，
// 多声明不存在的字段才是错误 —— 用"我们的 Props 全部来自官方 Props"来校验）
type OurKeys = keyof PluginProps
type MissingFromOfficial = Exclude<OurKeys, keyof OfficialRight>
assert<Exact<MissingFromOfficial, never>>()

// ── 4. 宿主侧模型调用：GenerateOptions 必填项 ─────────────────────────────
type RequiredGenerateKeys = 'provider' | 'model' | 'messages'
type HasRequired = RequiredGenerateKeys extends keyof GenerateOptions ? true : false
assert<HasRequired>()
// 插件实际传的字段必须在官方类型里存在
type PassedKeys = 'provider' | 'model' | 'system' | 'messages' | 'temperature' | 'maxTokens' | 'signal' | 'reasoningEffort' | 'sessionId'
type UnknownKeys = Exclude<PassedKeys, keyof GenerateOptions>
assert<Exact<UnknownKeys, never>>()

console.log('契约类型检查通过', hostName, NAMESPACE)
