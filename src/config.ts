/**
 * 插件配置：一份 schemastery schema，Web 设置页会自动渲染成表单；
 * 同一份默认值也被浏览器半镜像使用（设置里改了立即生效）。
 *
 * dsh 0.1.7 起设置不再由插件自己 `ctx.settings.register(...)` 占用命名空间：
 * 组合层（cordis.patch.yml / profile 的 patch）里的插件行本身就是那条配置，
 * 配置项能不能在设置页里改，取决于 schema 字段有没有 `.volatile()`。
 * 带 `.volatile()` 的字段解析出来是"引用"（`.get()` 读当前值），用户在设置页
 * 保存时 loader 只把新值 .set 进这些引用，插件不用重挂载就能读到新值。
 *
 * 条目 id 就是命名空间：profile 里那条插件行叫 `prompt-polish`
 * （见 cordis.patch.yml），设置写回也按这个 id 落到 profile patch。
 * @module dsh-prompt-polish/config
 */
import z from '@deepseek-ai/schemastery'

/** 设置命名空间 / 组合层插件条目 id。 */
export const NAMESPACE = 'prompt-polish'

/** 优化力度：控制模型改写的自由度。 */
export const STRENGTHS = ['conservative', 'balanced', 'aggressive']

export interface Config {
  /** 总开关：关闭后隐藏按钮并停用接口。 */
  enabled: boolean
  /** 优化力度。 */
  strength: 'conservative' | 'balanced' | 'aggressive'
  /** 采样温度：低温更忠实原文。 */
  temperature: number
  /** 单次调用的输出 token 上限。 */
  maxOutputTokens: number
  /** 输入字数上限，超限直接拒绝（不截断，避免改变原意）。 */
  maxInputChars: number
  /** 单次调用超时（毫秒）。 */
  timeoutMs: number
  /** 自定义系统提示词；留空使用内置策略。 */
  systemPrompt: string
  /** 自定义提示词与内置策略的组合方式。 */
  strategyMode: 'replace-default' | 'extend-default'
  /** 结果最长保留多久供“撤回优化”（毫秒）。 */
  undoWindowMs: number
}

/** 默认配置：schema 默认值与浏览器半镜像的唯一来源。 */
export const DEFAULT_CONFIG: Config = {
  enabled: true,
  strength: 'balanced',
  temperature: 0.3,
  // 激进档允许写到约 1500 字符；若会话选择带 reasoningEffort，推理也要从同一份额度里出，
  // 所以留出余量。被截断时插件拒绝写回并报错，不会把半截提示词塞进输入框。
  maxOutputTokens: 2048,
  maxInputChars: 12000,
  timeoutMs: 60000,
  systemPrompt: '',
  strategyMode: 'replace-default',
  undoWindowMs: 60000,
}

/** 设置页表单 schema。每个字段都带 `.volatile()`，才能在设置页里改并即时生效。 */
export const Config = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled)
    .description('总开关：关闭后隐藏输入框旁的小星星按钮。')
    .volatile(),
  // 注意：z.union(STRENGTHS) 会把类型退化成 string，导致 schema 与 Config 不匹配，
  // 所以逐项用 z.const 组成联合，保持字面量类型。
  strength: z.union([
    z.const('conservative'),
    z.const('balanced'),
    z.const('aggressive'),
  ]).default(DEFAULT_CONFIG.strength)
    .description('优化力度：保守=只纠错与结构化；均衡=补全隐含条件；激进=重写成完整任务描述（长度上限放宽到约 1500 字符）。')
    .volatile(),
  temperature: z.number().min(0).max(1).step(0.05).default(DEFAULT_CONFIG.temperature)
    .description('采样温度：越低越忠实原文。')
    .volatile(),
  maxOutputTokens: z.number().step(1).min(128).max(16384).default(DEFAULT_CONFIG.maxOutputTokens)
    .description('单次优化的输出 token 上限。激进档 + 会话开启推理时需要更大额度；被截断时插件拒绝写回并报错。')
    .volatile(),
  maxInputChars: z.number().step(1).min(100).max(200000).default(DEFAULT_CONFIG.maxInputChars)
    .description('输入字数上限：超限拒绝而不是截断（截断会改变原意）。')
    .volatile(),
  timeoutMs: z.number().step(1).min(5000).max(600000).default(DEFAULT_CONFIG.timeoutMs)
    .description('单次优化的超时时间（毫秒）。')
    .volatile(),
  systemPrompt: z.string().role('textarea').default(DEFAULT_CONFIG.systemPrompt)
    .description('自定义系统提示词：留空使用内置优化策略。')
    .volatile(),
  strategyMode: z.union(['replace-default', 'extend-default']).default(DEFAULT_CONFIG.strategyMode)
    .description('自定义提示词的组合方式：整体替换内置策略，或追加在内置策略之后（内置的硬性约束继续生效）。')
    .volatile(),
  undoWindowMs: z.number().step(1).min(0).max(600000).default(DEFAULT_CONFIG.undoWindowMs)
    .description('“撤回优化”入口的保留时长（毫秒）。')
    .volatile(),
})

/**
 * 插件行里解析出来的配置：`.volatile()` 字段解析成稳定引用，`.get()` 读当前值。
 *
 * 不直接对 schema 取类型：schemastery 的 `volatile()` 会改变 schema 的输出模式
 * （`Mode = 'volatile'`），宿主 loader 的配置解析对插件是不透明的，所以这里用
 * 最小结构面描述"我读到的配置长什么样"，由 `readConfig()` 在运行时收窄。
 */
export interface VolatileField<T> {
  /** 读当前值；用户在设置页保存后同一引用里就是新值。 */
  get(): T
}

/** `.volatile()` 之后的配置形状。 */
export interface ConfigFields {
  enabled: VolatileField<boolean>
  strength: VolatileField<'conservative' | 'balanced' | 'aggressive'>
  temperature: VolatileField<number>
  maxOutputTokens: VolatileField<number>
  maxInputChars: VolatileField<number>
  timeoutMs: VolatileField<number>
  systemPrompt: VolatileField<string>
  strategyMode: VolatileField<'replace-default' | 'extend-default'>
  undoWindowMs: VolatileField<number>
}

/**
 * 校验一份解析后的配置：schema 之外的不变量在这里 fail-loud。
 * @param value - 待校验的配置。
 * @returns 同一份配置（已通过校验）。
 */
export function resolveConfig(value: Config): Config {
  if (value === null || typeof value !== 'object') throw new Error('prompt-polish: 配置缺失')
  // 本插件跟随"会话当前选择的模型"，不提供写死路由的配置项（schema 里也没有这两个字段，
  // 用户手写的遗留段落会被 schemastery 在解析时丢弃）。
  if (!Number.isFinite(value.timeoutMs) || value.timeoutMs <= 0) throw new Error('prompt-polish: timeoutMs 必须是正数')
  if (!Number.isFinite(value.maxInputChars) || value.maxInputChars <= 0) throw new Error('prompt-polish: maxInputChars 必须是正数')
  return value
}

/** 输入体检结果。 */
export type InputCheck =
  | { ok: true; count: number }
  | { ok: false; code: 'empty' | 'too-long'; count: number; max: number }

/**
 * 输入体检：空输入与超限输入在客户端与宿主两侧用同一份规则拒绝。
 * @param text - 原始草稿。
 * @param max - 字数上限。
 * @returns 体检结果。
 */
export function checkInputText(text: string, max: number): InputCheck {
  const count = Array.from(text).length
  if (text.trim() === '') return { ok: false, code: 'empty', count, max }
  if (count > max) return { ok: false, code: 'too-long', count, max }
  return { ok: true, count }
}
