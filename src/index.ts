/**
 * dsh-prompt-polish 的宿主半（Node 侧）：
 *
 * 1. 注册设置命名空间 `prompt-polish`（Web 设置页自动渲染表单，保存即生效）；
 * 2. 注册 POST /api/prompt-polish/optimize，用 ctx.llm 以"当前会话选择的模型"
 *    改写提示词草稿。API key 只在宿主侧使用，永不进浏览器。
 *
 * 模型路由优先级：请求体里的会话选择 → 会话最近一次请求头 → 跨进程默认模型。
 * @module dsh-prompt-polish
 */
import type { Context } from '@deepseek-ai/cordis'
// 包级声明合并（ctx.settings / ctx.webServer 的类型来源）；import type 不产生运行时导入。
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import { Config, DEFAULT_CONFIG, NAMESPACE, checkInputText, resolveConfig, type Config as PluginConfig } from './config'
import { OptimizeFailure, optimizeText, toOptimizeError, type LlmFace, type Route } from './enhancer'
import { readBoundedJson, writeJson } from './http'
import { normalizeEnhanceText } from './prompts'
import { OPTIMIZE_ENDPOINT, type OptimizeResponse } from './protocol'

export const name = 'dsh-prompt-polish'
export const inject = ['llm', 'settings']

/** 请求体字节上限：字数上限 × 6 再加信封余量（JSON 转义最坏情况）。 */
const bodyCapOf = (maxInputChars: number): number => maxInputChars * 6 + 4096

/** 结构面：会话层（可选依赖）。 */
interface SessionFace {
  requestHeader?: (() => { config?: { provider?: unknown; model?: unknown; reasoningEffort?: unknown } } | undefined) | { config?: { provider?: unknown; model?: unknown } }
}
interface SessionsFace {
  get(id: string): SessionFace | undefined
}
/** 结构面：设置提供方（跨命名空间读取默认模型）。 */
interface SettingsFace {
  get(ns: string): unknown
}

/** 把一对未受信任的 provider/model 收窄成路由。 */
function routeOf(value: { provider?: unknown; model?: unknown; reasoningEffort?: unknown } | null | undefined): Route | undefined {
  if (value === null || value === undefined) return undefined
  const provider = typeof value.provider === 'string' ? value.provider.trim() : ''
  const model = typeof value.model === 'string' ? value.model.trim() : ''
  if (provider === '' || model === '') return undefined
  const effort = typeof value.reasoningEffort === 'string' && value.reasoningEffort !== '' ? value.reasoningEffort : undefined
  return effort === undefined ? { provider, model } : { provider, model, reasoningEffort: effort }
}

/** 会话最近一次请求使用的模型路由（会话层抖动一律降级为 undefined）。 */
function sessionRouteOf(ctx: Context, sessionId: string | undefined): Route | undefined {
  if (sessionId === undefined || sessionId === '') return undefined
  try {
    const session = (ctx.get('sessions') as SessionsFace | undefined)?.get(sessionId)
    if (session === undefined) return undefined
    const header = session.requestHeader
    const epoch = typeof header === 'function' ? header.call(session) : header
    return routeOf(epoch?.config)
  } catch {
    return undefined
  }
}

/** 跨进程默认模型（dsh-agent-default-model 注册的命名空间）。 */
function defaultRouteOf(ctx: Context): Route | undefined {
  try {
    return routeOf((ctx.get('settings') as SettingsFace | undefined)?.get('agent-default-model') as never)
  } catch {
    return undefined
  }
}

/**
 * 挂载宿主半。
 * @param ctx - 本插件的 fiber 上下文。
 * @param config - 组合行里的配置（会成为设置命名空间的 base 层）。
 */
export function apply(ctx: Context, config: PluginConfig = { ...DEFAULT_CONFIG }): void {
  // 设置命名空间：用户层覆盖 base 层，live 生效。
  const scope = ctx.settings.register(NAMESPACE, Config, { base: config, applies: 'live' })
  const readConfig = (): PluginConfig => resolveConfig(scope.get())

  const webServer = ctx.get('webServer') as { register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: never, res: never) => void }): () => void } | undefined
  if (webServer === undefined) {
    ctx.logger.info('prompt-polish: 当前组合没有 webServer，仅注册设置命名空间')
    return
  }

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: OPTIMIZE_ENDPOINT,
    handler: (req, res) => {
      void serve(ctx, readConfig, req as never, res as never)
    },
  }), 'dsh-prompt-polish: optimize route')

  ctx.logger.info('prompt-polish: 已挂载 %s', OPTIMIZE_ENDPOINT)
}

/**
 * 处理一次优化请求。
 * @param ctx - 插件上下文。
 * @param readConfig - 每次请求重新读取配置（设置改动下一次调用即生效）。
 * @param req - 请求。
 * @param res - 响应。
 */
async function serve(
  ctx: Context,
  readConfig: () => PluginConfig,
  req: { method?: string; headers: Record<string, unknown>; url?: string; on(event: string, listener: () => void): void; destroy(): void; [Symbol.asyncIterator](): AsyncIterator<unknown> },
  res: { writeHead(status: number, headers: Record<string, string>): void; end(body?: string): void; once(event: string, listener: () => void): void; socket?: { destroy(): void } | null },
): Promise<void> {
  const respond = (status: number, body: OptimizeResponse): void => writeJson(res as never, status, body)

  if (req.method !== 'POST') {
    respond(405, { ok: false, error: { code: 'rejected', message: '只接受 POST' } })
    return
  }
  let pluginConfig: PluginConfig
  try {
    pluginConfig = readConfig()
  } catch (error) {
    respond(500, { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : String(error) } })
    return
  }
  if (!pluginConfig.enabled) {
    respond(403, { ok: false, error: { code: 'rejected', message: '提示词优化已在设置中关闭' } })
    return
  }
  const cap = bodyCapOf(pluginConfig.maxInputChars)
  let body: unknown
  try {
    body = await readBoundedJson(req as never, cap)
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'body too large'
    respond(tooLarge ? 413 : 422, { ok: false, error: { code: 'rejected', message: tooLarge ? '请求体过大' : '请求体不是合法 JSON' } })
    return
  }
  const record = body as { text?: unknown; sessionId?: unknown; selection?: unknown } | null
  if (record === null || typeof record !== 'object' || typeof record.text !== 'string') {
    respond(422, { ok: false, error: { code: 'rejected', message: '请求体必须是 { text, sessionId?, selection? }' } })
    return
  }
  // 先按输入框的语义清洗（去掉 chip 尾随的零宽空格）：只有附件/chip 的草稿
  // 清洗后是空串，与真空输入走同一条拒绝路径，宿主不会空跑一次模型调用。
  const text = normalizeEnhanceText(record.text)
  const check = checkInputText(text, pluginConfig.maxInputChars)
  if (!check.ok) {
    respond(422, {
      ok: false,
      error: check.code === 'empty'
        ? { code: 'rejected', message: '请先输入内容' }
        : { code: 'rejected', message: `输入过长（${check.count}/${check.max}），请先精简` },
    })
    return
  }
  const sessionId = typeof record.sessionId === 'string' && record.sessionId !== '' ? record.sessionId : undefined
  const selection = routeOf(record.selection as never)
  const route = selection ?? sessionRouteOf(ctx, sessionId) ?? defaultRouteOf(ctx)
  if (route === undefined) {
    respond(409, { ok: false, error: { code: 'unconfigured', message: '无法确定使用哪个模型：请先在会话里选择模型' } })
    return
  }
  const controller = new AbortController()
  const onClose = (): void => controller.abort()
  req.on('aborted', onClose)
  res.once('close', onClose)
  try {
    const llm = ctx.get('llm') as LlmFace | undefined
    if (llm === undefined) {
      respond(503, { ok: false, error: { code: 'unconfigured', message: '当前组合没有 llm 服务' } })
      return
    }
    const value = await optimizeText(llm, {
      config: pluginConfig,
      route,
      text,
      signal: controller.signal,
      ...(sessionId === undefined ? {} : { sessionId }),
    })
    respond(200, { ok: true, value })
  } catch (error) {
    const detail = toOptimizeError(error)
    const status = detail.code === 'timeout' ? 504
      : detail.code === 'aborted' ? 499
        : detail.code === 'unconfigured' ? 409
          : detail.code === 'rejected' ? 422
            : 502
    if (detail.code === 'aborted') return
    const message = error instanceof OptimizeFailure ? detail.message : detail.message
    respond(status, { ok: false, error: { code: detail.code, ...(message === undefined ? {} : { message }) } })
  }
}
