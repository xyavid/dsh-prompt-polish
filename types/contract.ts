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
import type { Config as PluginConfig } from '../src/config'
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

// ── 2. 设置命名空间 ───────────────────────────────────────────────────────
// register(ns, schema, options) 的 schema 必须是 schemastery 的 z<T>
assert<Exact<typeof Config, z<PluginConfig>>>()
// 命名空间必须是合法的 lowercase-hyphenated 标识符（用字面量类型粗略校验）
const namespace: typeof NAMESPACE = 'prompt-polish'
assert<Exact<typeof namespace, 'prompt-polish'>>()
// 默认值必须完整覆盖 Config
assert<Exact<keyof typeof DEFAULT_CONFIG, keyof PluginConfig>>()

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
