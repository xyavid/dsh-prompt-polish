/**
 * 宿主半的设置接口回归测试（dsh 0.1.7 形态）：
 *
 * 1. `apply` 不再调用 `ctx.settings.register`（0.1.7 已删除），挂载时不会抛错，
 *    并会注册优化路由；
 * 2. 配置字段是 `volatile` 引用（`.get()`），每次请求现取——用户在设置页
 *    改的值无需重挂载插件即刻生效（用 `enabled` 开关验证）；
 * 3. 没有 webServer / 配置解析失败时不抛错，降级为"不注册路由 / 用默认值"。
 *
 * 直接加载真实的 `lib/index.js`（不做打包，保持与线上一致的模块解析）。
 */
import assert from 'node:assert/strict'
import { apply, inject, name } from '../lib/index.js'

/** 造一个 volatile 引用（与 schemastery `.volatile()` 的运行时形状一致）。 */
const ref = (value) => Object.freeze({ get: () => value })
/** 把普通配置包成引用（模拟 loader 解析出来的插件行配置）。 */
const refsOf = (config) => Object.fromEntries(Object.entries(config).map(([k, v]) => [k, ref(v)]))
/** 一份最小可用配置。 */
const BASE = {
  enabled: true,
  strength: 'balanced',
  temperature: 0.3,
  maxOutputTokens: 2048,
  maxInputChars: 12000,
  timeoutMs: 60000,
  systemPrompt: '',
  strategyMode: 'replace-default',
  undoWindowMs: 60000,
}

/** 造一个假响应，收集状态码与响应体。 */
function fakeRes() {
  return {
    status: 0,
    body: '',
    headers: {},
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(body) {
      this.body = body ?? ''
    },
    once() {},
  }
}

/**
 * 路由 handler 是"发起即返回"（内部 `void serve(...)`），所以断言前要等响应落地。
 * @param res - 假响应。
 * @returns 响应写出后的 promise。
 */
async function settle(res) {
  for (let i = 0; i < 500 && res.status === 0; i += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
  await new Promise((resolve) => setImmediate(resolve))
}

/**
 * 调用一次路由并等响应落地。
 * @param route - 注册进假 webServer 的路由。
 * @param payload - 请求体。
 * @returns 已写出的响应。
 */
async function call(route, payload) {
  const res = fakeRes()
  route.handler(fakeReq(payload), res)
  await settle(res)
  return res
}

/** 造一个假请求体（POST JSON）。 */
function fakeReq(payload) {
  const chunks = [Buffer.from(JSON.stringify(payload), 'utf8')]
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    on() {},
    destroy() {},
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

/** 记录路由注册与日志的假 ctx。 */
function fakeCtx({ withWebServer = true } = {}) {
  const routes = []
  const logs = []
  const ctx = {
    routes,
    logs,
    get(service) {
      if (service === 'webServer' && withWebServer) {
        return {
          register(route) {
            routes.push(route)
            return () => {}
          },
        }
      }
      if (service === 'sessions') return { get: () => undefined }
      if (service === 'settings') {
        // 0.1.7 的设置域：只有表单投影 API，没有 register。
        return {
          describe: () => [{ ns: 'agent-default-model', value: { provider: 'stub', model: 'stub-model' } }],
        }
      }
      return undefined
    },
    effect(callback) {
      return callback()
    },
    logger: {
      info: (...args) => logs.push(['info', args.join(' ')]),
      warn: (...args) => logs.push(['warn', args.join(' ')]),
    },
  }
  return ctx
}

console.log('[1] 模块导出:', name, '| inject =', JSON.stringify(inject))
assert.equal(name, 'dsh-prompt-polish')
assert.deepEqual(inject, ['llm', 'webServer'], 'webServer 必须在 inject 里，否则 apply 会在 webServer 就绪前跑掉、路由永远不注册')

// ── 1. 挂载：不得触碰 ctx.settings.register ────────────────────────────────
{
  const ctx = fakeCtx()
  /*
   * 0.1.7 的设置域是一个普通服务对象：没有 register 方法。
   * 旧实现 `ctx.settings.register(...)` 在真机上会抛
   * "ctx.settings.register is not a function"——这里把 register 定义成会抛错的
   * 陷阱 getter，任何回归都会立刻在这个测试里炸出来。
   */
  const settingsFace = ctx.get('settings')
  Object.defineProperty(settingsFace, 'register', {
    get() {
      throw new TypeError('ctx.settings.register is not a function')
    },
  })
  const originalGet = ctx.get
  ctx.get = (service) => (service === 'settings' ? settingsFace : originalGet(service))

  apply(ctx, refsOf(BASE))
  assert.equal(ctx.routes.length, 1, '应注册一条优化路由')
  assert.equal(ctx.routes[0].path, '/api/prompt-polish/optimize')
  assert.equal(ctx.routes[0].kind, 'exact')

  // 一次真实请求：默认模型走 describe()，同样不能碰 register。
  const probe = await call(ctx.routes[0], { text: '优化我' })
  assert.equal(probe.status, 503, '假 ctx 没有 llm，应停在 503，得到 ' + probe.status)
  console.log('[2] 挂载成功且全程未调用 ctx.settings.register；路由:', ctx.routes[0].path)
}

// ── 2. volatile 引用：改设置后无需重挂载即刻生效 ──────────────────────────
{
  const ctx = fakeCtx()
  let enabled = true
  let maxInputChars = 100
  const config = {
    ...refsOf(BASE),
    enabled: { get: () => enabled },
    maxInputChars: { get: () => maxInputChars },
  }
  apply(ctx, config)

  // 输入长度 5 ≤ 100：走到"没有 llm 服务"这一步（503），说明配置读到了。
  const shortRes = await call(ctx.routes[0], { text: '优化我' })
  assert.equal(shortRes.status, 503, '应读到 maxInputChars=100 并走到 llm 检查，得到 ' + shortRes.status)

  // 把字数上限收紧到 2，同一挂载实例立刻按新值拒绝。
  maxInputChars = 2
  const longRes = await call(ctx.routes[0], { text: '优化我' })
  assert.equal(longRes.status, 422, '应读到新 maxInputChars=2 并拒绝输入，得到 ' + longRes.status)
  assert.match(longRes.body, /输入过长/)
  maxInputChars = 100

  // 关掉总开关：同一挂载实例立刻返回 403。
  enabled = false
  const offRes = await call(ctx.routes[0], { text: '优化我' })
  assert.equal(offRes.status, 403, '应读到新 enabled=false，得到 ' + offRes.status)
  assert.match(offRes.body, /设置中关闭/)

  // 重新打开：恢复可用。
  enabled = true
  const onRes = await call(ctx.routes[0], { text: '优化我' })
  assert.equal(onRes.status, 503)
  console.log('[3] volatile 引用生效：422 / 403 / 503 均按当前值返回')
}

// ── 3. 没有 webServer：留警告日志，不抛错、不注册路由 ──────────────────────
{
  const ctx = fakeCtx({ withWebServer: false })
  apply(ctx, refsOf(BASE))
  assert.equal(ctx.routes.length, 0)
  assert.ok(ctx.logs.some(([level, text]) => level === 'warn' && /没有 webServer/.test(text)), '缺少 webServer 时应有可诊断的警告')
  console.log('[4] 无 webServer 时降级并留痕:', ctx.logs.find(([level]) => level === 'warn')[1])
}

// ── 4. 配置不合法：退回默认值并留痕，不抛错 ────────────────────────────────
{
  const ctx = fakeCtx()
  apply(ctx, refsOf({ ...BASE, timeoutMs: -1 }))
  const res = await call(ctx.routes[0], { text: '优化我' })
  assert.equal(res.status, 503, '非法 timeoutMs 应退回默认值而不是抛错，得到 ' + res.status)
  assert.ok(ctx.logs.some(([level, text]) => level === 'warn' && /配置解析失败/.test(text)))
  console.log('[5] 非法配置降级成功:', ctx.logs.find(([level]) => level === 'warn')[1])
}

console.log('PASS：宿主半设置接口（volatile）回归测试通过')
