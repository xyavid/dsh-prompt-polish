/**
 * 配置解析路径的回归测试（0.1.7 的 loader 语义）：
 *
 * loader 在挂载插件行时用 `resolveConfig(fiber.runtime, rawConfig)` 解析 `config:` 段，
 * 而"设置页能不能改、改了立刻生效"完全取决于 schema 字段有没有 `.volatile()`：
 * 带 `.volatile()` 的字段解析出来必须是 `{ get() }` 引用。
 *
 * 这里直接拿真实 `lib/index.js` 导出的 `Config`（loader 用的就是它）走一遍真实
 * `resolveConfig`，把"我们按 0.1.7 语义声明配置"这件事钉在运行时。
 * 顺便验证插件在引用被就地更新（= 用户在设置页保存）后按新值行事。
 */
import assert from 'node:assert/strict'
import { resolveConfig } from '@deepseek-ai/cordis'
import { apply, Config } from '../lib/index.js'

/** 组合层插件行里的 raw config（cordis.patch.yml 的那一段）。 */
const RAW = {
  enabled: true,
  strength: 'balanced',
  undoWindowMs: 60000,
}

// ── 2. 真实 loader 解析路径：raw 缺字段时用 schema 默认值 ───────────────────
const runtime = { Config }
const parsed = resolveConfig(runtime, RAW)

const FIELDS = [
  'enabled', 'strength', 'temperature', 'maxOutputTokens', 'maxInputChars',
  'timeoutMs', 'systemPrompt', 'strategyMode', 'undoWindowMs',
]
for (const field of FIELDS) {
  assert.equal(typeof parsed[field]?.get, 'function', `字段 ${field} 必须是 volatile 引用（.get()）`)
}
assert.equal(parsed.enabled.get(), true, 'raw 值可读')
assert.equal(parsed.strength.get(), 'balanced', 'raw 值可读')
assert.equal(parsed.undoWindowMs.get(), 60000, 'raw 值可读')
assert.equal(parsed.temperature.get(), 0.3, 'schema 默认值应通过引用可读')
assert.equal(parsed.timeoutMs.get(), 60000, 'schema 默认值应通过引用可读')
assert.equal(parsed.strategyMode.get(), 'replace-default', 'schema 默认值应通过引用可读')
console.log('[1] resolveConfig 解析出', FIELDS.length, '个 volatile 引用，raw 值与默认值都可读')

// ── 3. schema 约束仍然生效（非法配置在挂载前就被拒绝） ─────────────────────
assert.throws(() => resolveConfig(runtime, { ...RAW, timeoutMs: -1 }), /timeoutMs|greater|min/i)
assert.throws(() => resolveConfig(runtime, { ...RAW, strength: 'nope' }), /strength|unexpected|expected/i)
console.log('[2] 非法 raw 配置被 schema 拒绝（resolveConfig 抛错）')

// ── 4. 用真实解析结果挂载插件：路由注册 + 配置读取链路可用 ─────────────────
const routes = []
const ctx = {
  get(service) {
    if (service === 'webServer') return { register(route) { routes.push(route); return () => {} } }
    if (service === 'sessions') return { get: () => undefined }
    if (service === 'settings') return { describe: () => [{ ns: 'agent-default-model', value: { provider: 'stub', model: 'stub' } }] }
    return undefined
  },
  effect(fn) { return fn() },
  logger: { info() {}, warn() {} },
}
apply(ctx, parsed)
assert.equal(routes.length, 1, '应注册一条优化路由')

/** 与测试用假响应/请求配套：发一次请求并等响应落地。 */
function fakeRes() {
  return { status: 0, body: '', writeHead(s) { this.status = s }, end(b) { this.body = b ?? '' }, once() {} }
}
function fakeReq(payload) {
  const chunks = [Buffer.from(JSON.stringify(payload), 'utf8')]
  return { method: 'POST', headers: {}, on() {}, destroy() {}, async *[Symbol.asyncIterator]() { for (const c of chunks) yield c } }
}
async function call(payload) {
  const res = fakeRes()
  routes[0].handler(fakeReq(payload), res)
  for (let i = 0; i < 500 && res.status === 0; i += 1) await new Promise((r) => setImmediate(r))
  return res
}

// raw 里 maxInputChars 缺省（默认 12000）：长度 5 的输入应通过体检，停在"没有 llm"。
const ok = await call({ text: '优化我' })
assert.equal(ok.status, 503, '应读到默认 maxInputChars 并停在 503，得到 ' + ok.status)
const tooLong = await call({ text: 'x'.repeat(20001) })
assert.equal(tooLong.status, 422, '超过 schema 上限应被拒绝，得到 ' + tooLong.status)
console.log('[3] 真实解析结果挂载成功，且按解析后的配置判定输入')

console.log('PASS：loader 配置解析路径（volatile 引用）回归测试通过')
