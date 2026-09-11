/**
 * 一次优化调用的执行体：经 ctx.llm 走"当前会话选择的模型"，
 * 组装消息、流式收集、处理超时与取消、校验终止原因、清洗输出。
 * @module dsh-prompt-polish/enhancer
 */
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { OptimizeError, OptimizeResult } from './protocol'
import { effectiveSystemPrompt, normalizeOutput, renderUserPrompt } from './prompts'
import type { Config } from './config'

/** ctx.llm 的结构面（测试时可替换）。 */
export interface LlmFace {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/** 一次解析出的模型路由。 */
export interface Route {
  provider: string
  model: string
  reasoningEffort?: string
}

/** 携带线协议错误的失败。 */
export class OptimizeFailure extends Error {
  readonly detail: OptimizeError
  constructor(detail: OptimizeError) {
    super(detail.message ?? detail.code)
    this.name = 'OptimizeFailure'
    this.detail = detail
  }
}

/** 一次优化调用的参数。 */
export interface OptimizeCall {
  /** 已解析的插件配置。 */
  config: Config
  /** 模型路由。 */
  route: Route
  /** 原始草稿。 */
  text: string
  /** 调用方取消信号（浏览器断开 / 用户按发送）。 */
  signal?: AbortSignal
  /** 会话 id，仅作为请求标记透传给适配器。 */
  sessionId?: string
  /** 增量回调（仅用于显示；回调抛错不影响结果）。 */
  onDelta?: (delta: string) => void
}

/** 把任意异常折叠成线协议错误。 */
export function toOptimizeError(error: unknown): OptimizeError {
  if (error instanceof OptimizeFailure) return error.detail
  const message = error instanceof Error ? error.message : String(error)
  return { code: 'upstream', message }
}

/**
 * 执行一次优化调用。
 * @param llm - ctx.llm 服务。
 * @param call - 调用参数。
 * @returns 优化结果（已清洗的正文 + 路由 + 耗时）。
 * @throws OptimizeFailure 携带可显示的错误码。
 */
export async function optimizeText(llm: LlmFace, call: OptimizeCall): Promise<OptimizeResult> {
  const started = Date.now()
  const controller = new AbortController()
  let timedOut = false
  let callerAborted = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, call.config.timeoutMs)
  const onCallerAbort = (): void => {
    if (!timedOut) callerAborted = true
    controller.abort()
  }
  if (call.signal?.aborted === true) {
    callerAborted = true
    controller.abort()
  } else {
    call.signal?.addEventListener('abort', onCallerAbort, { once: true })
  }
  const signal = controller.signal
  const fail = (detail: OptimizeError): never => {
    throw new OptimizeFailure(detail)
  }
  try {
    if (signal.aborted) {
      if (timedOut) fail({ code: 'timeout', message: `优化超过 ${call.config.timeoutMs} 毫秒未完成` })
      fail({ code: 'aborted' })
    }
    // 用户消息 = 强化用 USER 模板 + 草稿（{input} 注入），
    // 模板里的语言一致性与输出格式约束随消息一起进模型。
    const messages = [
      createUserMessage({
        content: [{ type: 'text', text: renderUserPrompt(call.text) }],
        source: { kind: 'plugin', plugin: 'dsh-prompt-polish' },
      }),
    ]
    const options: GenerateOptions = {
      provider: call.route.provider,
      model: call.route.model,
      system: effectiveSystemPrompt(call.config),
      messages,
      temperature: call.config.temperature,
      maxTokens: call.config.maxOutputTokens,
      signal,
      ...(call.route.reasoningEffort === undefined ? {} : { reasoningEffort: call.route.reasoningEffort as GenerateOptions['reasoningEffort'] }),
      ...(call.sessionId === undefined ? {} : { sessionId: call.sessionId as GenerateOptions['sessionId'] }),
    }
    const assembler = new BlockAssembler()
    const iterator = llm.stream(options)[Symbol.asyncIterator]()
    const abortError = (): Error => {
      const error = new Error('dsh-prompt-polish: aborted')
      error.name = 'AbortError'
      return error
    }
    // 把迭代与"取消"赛跑：适配器卡住不产出时也能按时超时。
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(abortError())
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      while (true) {
        if (signal.aborted) throw abortError()
        const next = await Promise.race([iterator.next(), aborted])
        if (next.done === true) break
        assembler.push(next.value)
        if (next.value.type === 'text-delta' && call.onDelta !== undefined) {
          try {
            call.onDelta(next.value.text)
          } catch {
            // 显示通道坏了不能影响优化本身
          }
        }
      }
    } catch (error) {
      // 超时与取消是靠"与迭代赛跑"实现的，赢的是这里的裸 AbortError。
      // 不翻译的话它会冒泡成 upstream，用户看到"模型调用失败"而不是
      // "优化超时 / 已取消"，HTTP 状态码也会从 504/499 变成 502。
      if (timedOut) fail({ code: 'timeout', message: `优化超过 ${call.config.timeoutMs} 毫秒未完成` })
      if (callerAborted) fail({ code: 'aborted' })
      throw error
    } finally {
      if (onAbort !== undefined && !signal.aborted) signal.removeEventListener('abort', onAbort)
      if (signal.aborted) void iterator.return?.(undefined as never).catch(() => {})
    }
    const finish = assembler.finish
    if (finish.kind === 'error' || finish.kind === 'aborted') {
      if (timedOut) fail({ code: 'timeout', message: `优化超过 ${call.config.timeoutMs} 毫秒未完成` })
      if (callerAborted) fail({ code: 'aborted' })
      return fail({ code: 'upstream', message: finish.failure.message })
    }
    if (finish.kind === 'max-tokens') {
      // 截断的结果比原文更糟：宁可失败也不写回半截提示词。
      return fail({ code: 'upstream', message: '优化结果在 token 上限处被截断，请调大 maxOutputTokens 或缩短原文' })
    }
    const raw = assembler.blocks()
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
    const text = normalizeOutput(raw)
    if (text.trim() === '') return fail({ code: 'upstream', message: '模型没有返回任何文本' })
    return {
      text,
      provider: call.route.provider,
      model: call.route.model,
      elapsedMs: Date.now() - started,
    }
  } finally {
    clearTimeout(timer)
    call.signal?.removeEventListener('abort', onCallerAbort)
  }
}
