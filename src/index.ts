/**
 * dsh-prompt-polish 的宿主半（Node 侧）：
 *
 * 1. 用组合层（profile 的插件行）解析出来的配置跑起来；设置页里的改动由
 *    dsh 的设置域直接写回 profile patch，插件侧读的是 schema 里带
 *    `.volatile()` 的稳定引用（`.get()` 拿当前值），因此不需要自己注册命名空间。
 * 2. 注册 POST /api/prompt-polish/optimize，用 ctx.llm 以"当前会话选择的模型"
 *    改写提示词草稿。API key 只在宿主侧使用，永不进浏览器。
 *
 * 模型路由优先级：请求体里的会话选择 → 会话最近一次请求头 → 跨进程默认模型。
 * @module dsh-prompt-polish
 */
import type { Context } from '@deepseek-ai/cordis'
// 包级声明合并（ctx.webServer / ctx.llm 的类型来源）；import type 不产生运行时导入。
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import { Config, DEFAULT_CONFIG, NAMESPACE, checkInputText, resolveConfig, type Config as PluginConfig, type ConfigFields } from './config'
import { OptimizeFailure, optimizeText, toOptimizeError, type LlmFace, type Route } from './enhancer'
import { readBoundedJson, writeJson } from './http'
import { normalizeEnhanceText } from './prompts'
import { OPTIMIZE_ENDPOINT, type OptimizeResponse } from './protocol'

export const name = 'dsh-prompt-polish'
/**
 * 依赖声明：`llm` 用于模型调用，`webServer` 用于注册路由。
 *
 * `webServer` 必须写进 inject：0.1.7 里给 webServer 注册路由的插件（`dsh-web-app`、
 * `dsh-host-frontend-static`、`dsh-client-connection` 等）都这么做。组合树里本插件的行
 * 排在 webServer 插件之前，若只声明 `llm`，`apply` 会在 webServer 就绪前执行，
 * `ctx.get('webServer')` 拿到 undefined，插件静默早退——表现为"插件加载成功但
 * `/api/prompt-polish/optimize` 永远 404"。声明显式依赖后，cordis 会等该服务可用
 * 再调用 `apply`。
 */
export const inject = ['llm', 'webServer']
/** dsh loader 用模块导出的 `Config` 解析插件行的 `config:` 段。 */
export { Config }

/** 请求体字节上限：字数上限 × 6 再加信封余量（JSON 转义最坏情况）。 */
const bodyCapOf = (maxInputChars: number): number => maxInputChars * 6 + 4096

/** 结构面：会话层（可选依赖）。 */
interface SessionFace {
  requestHeader?: (() => { config?: { provider?: unknown; model?: unknown; reasoningEffort?: unknown } } | undefined) | { config?: { provider?: unknown; model?: unknown } }
}
interface SessionsFace {
  get(id: string): SessionFace | undefined
}
/**
 * 结构面：设置域服务（只用于跨命名空间读取"默认模型"）。
 * 0.1.7 的设置域是"表单投影"服务：`describe()` 为每个组合层插件条目给出
 * 一份带 schema、resolved value 与 revision 的描述符，`ns` 是条目 id。
 */
interface SettingsDescriptorFace {
  ns: string
  value?: unknown
}
interface SettingsFace {
  describe(options?: { redactSecrets?: boolean }): SettingsDescriptorFace[]
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

/** 跨进程默认模型（`agent-default-model` 条目的设置描述符）。 */
function defaultRouteOf(ctx: Context): Route | undefined {
  try {
    const descriptors = (ctx.get('settings') as SettingsFace | undefined)?.describe?.()
    const entry = descriptors?.find((row) => row.ns === 'agent-default-model')
    return routeOf(entry?.value as never)
  } catch {
    return undefined
  }
}

/**
 * 把"配置引用"解成普通值：dsh 0.1.7 里带 `.volatile()` 的配置字段是稳定引用
 * （`.get()` 读当前值，用户保存设置后同一个引用里就是新值），因此每次请求
 * 现取即可，不需要重挂载插件。带兜底：宿主若直接传普通值进来也照样能用。
 * @param ctx - 插件上下文（仅用于解析失败时留痕，可省略）。
 * @param configRefs - `apply` 拿到的配置。
 * @returns 一份自洽的普通配置。
 */
function readConfig(ctx: Context | undefined, configRefs: ConfigFields | PluginConfig): PluginConfig {
  const field = (key: keyof PluginConfig): unknown => {
    const raw = (configRefs as unknown as Record<string, unknown>)[key]
    if (raw !== null && typeof raw === 'object' && typeof (raw as { get?: unknown }).get === 'function') {
      return (raw as { get(): unknown }).get()
    }
    return raw
  }
  const value = {
    enabled: field('enabled') ?? DEFAULT_CONFIG.enabled,
    strength: field('strength') ?? DEFAULT_CONFIG.strength,
    temperature: field('temperature') ?? DEFAULT_CONFIG.temperature,
    maxOutputTokens: field('maxOutputTokens') ?? DEFAULT_CONFIG.maxOutputTokens,
    maxInputChars: field('maxInputChars') ?? DEFAULT_CONFIG.maxInputChars,
    timeoutMs: field('timeoutMs') ?? DEFAULT_CONFIG.timeoutMs,
    systemPrompt: field('systemPrompt') ?? DEFAULT_CONFIG.systemPrompt,
    strategyMode: field('strategyMode') ?? DEFAULT_CONFIG.strategyMode,
    undoWindowMs: field('undoWindowMs') ?? DEFAULT_CONFIG.undoWindowMs,
  } as PluginConfig
  try {
    return resolveConfig(value)
  } catch (error) {
    // 配置解析失败不该让整个按钮消失：退回默认值，并在宿主日志里留痕。
    ctx?.logger.warn('prompt-polish: 配置解析失败，本次使用默认值')
    ctx?.logger.warn(error)
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * 挂载宿主半。
 * @param ctx - 本插件的 fiber 上下文。
 * @param configRefs - 组合行里的配置（volatile 字段是稳定引用）。
 */
export function apply(ctx: Context, configRefs: ConfigFields = Config(DEFAULT_CONFIG) as unknown as ConfigFields): void {
  const readPluginConfig = (): PluginConfig => readConfig(ctx, configRefs)

  const webServer = ctx.get('webServer') as { register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: never, res: never) => void }): () => void } | undefined
  if (webServer === undefined) {
    // `webServer` 在 inject 里，正常组合下这里不会被走到；真走到说明外壳的行为变了
    // （或有人把 webServer 从 inject 里删了）——报出来而不是静默不注册路由。
    ctx.logger.warn('prompt-polish: 组合里没有 webServer 服务，无法注册 %s（请确认 inject 含 webServer）', OPTIMIZE_ENDPOINT)
    return
  }

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: OPTIMIZE_ENDPOINT,
    handler: (req, res) => {
      void serve(ctx, readPluginConfig, req as never, res as never)
    },
  }), 'dsh-prompt-polish: optimize route')

  ctx.logger.info('prompt-polish: 已挂载 %s（设置条目 %s）', OPTIMIZE_ENDPOINT, NAMESPACE)
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
