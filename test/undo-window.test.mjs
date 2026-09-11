/**
 * 撤回窗口的行为回归：用 jsdom + react-dom/client 真实挂载按钮组件，验证
 *  - 宿主设置里的 `undoWindowMs` 真的驱动了"撤回态过期"；
 *  - 点撤回箭头会把草稿还原成原文。
 *
 * 这里不走外壳，而是用与外壳相同的绑定规则把 client bundle 跑起来：
 * module-loader 信封 → factory(require) → apply(假 ctx) → 取出注册的组件。
 */
import { JSDOM } from 'jsdom'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = require('react')

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.document = dom.window.document
// Node 24 的 globalThis.navigator 是只读 getter，用 defineProperty 覆盖。
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true

/** 每个会话的草稿状态（组件通过 useInput 读取）。 */
let inputState = { draft: '帮我改一下登录页按钮颜色', phase: 'plain', occurrences: [], attachmentIds: [] }
/** 组件每次调用 setDraft 的记录。 */
const writes = []
/** 真实输入机会发布快照；这里用版本号模拟，驱动 useSyncExternalStore 重渲染。 */
let inputVersion = 0
const inputListeners = new Set()
const inputSnapshot = () => {
  const v = inputVersion
  return () => v
}
/** 发布一次草稿变更（等价于官方输入机 store 的 publish）。 */
function publishInput(next) {
  inputState = { ...inputState, ...next }
  inputVersion += 1
  for (const listener of inputListeners) listener()
}

const fakeSlots = {
  inject(_key, factory) {
    factory()
  },
  register(_options, component) {
    registered = component
    return () => {}
  },
}
let registered

/** 模拟宿主设置：undoWindowMs 可变，subscribe 用于触发重渲染。 */
let undoWindowMs = 1234
const settingsListeners = new Set()
const settingsScope = {
  bind: () => ({
    getSnapshot: () => ({ value: { undoWindowMs } }),
    subscribe: (listener) => {
      settingsListeners.add(listener)
      return () => settingsListeners.delete(listener)
    },
  }),
}

const services = { slots: fakeSlots, settingsScope }
const fakeCtx = {
  inject(deps, callback) {
    const scope = {}
    for (const name of deps) if (name in services) scope[name] = services[name]
    return callback(scope)
  },
  effect(fn) {
    return fn()
  },
}

// 加载真实产物（与外壳相同的信封）
let registration
globalThis.window.__ModuleLoader__ = { load: (reg) => { registration = reg } }
const code = readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8')
new Function('window', 'document', 'require', 'module', 'exports', code)(
  globalThis.window, globalThis.document, (spec) => require(spec), { exports: {} }, {},
)
const mod = registration.factory((spec) => require(spec))
mod.apply(fakeCtx)

if (registered === undefined) {
  console.error('FAIL: 组件没有被注册')
  process.exit(1)
}

/** 等待 ms 毫秒（用假定时器推进，避免真的等）。 */
const advance = (ms) => new Promise((done) => setTimeout(done, ms))

const props = {
  // 与官方 useInput 同语义：订阅快照 + 选择器。
  useInput(selector) {
    const version = React.useSyncExternalStore(
      (listener) => {
        inputListeners.add(listener)
        return () => inputListeners.delete(listener)
      },
      inputSnapshot(),
      inputSnapshot(),
    )
    void version
    return selector(inputState)
  },
  inputActions: {
    setDraft(text) {
      writes.push(text)
      publishInput({ draft: text })
    },
  },
}

const container = document.getElementById('root')
const root = createRoot(container)
const render = () => {
  act(() => {
    root.render(React.createElement(registered, props))
  })
}
render()

const button = () => container.querySelector('.dsh-pp-btn')
const titleOf = () => button()?.getAttribute('title') ?? ''

// 1) 初始为空闲态
console.log('initial  :', titleOf())
if (titleOf() !== '优化提示词') { console.error('FAIL: 初始应为空闲态'); process.exit(1) }

// 2) 点击 → 触发一次优化请求（fetch 打桩为返回成功）
const originalFetch = globalThis.fetch
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ ok: true, value: { text: '优化后的提示词正文' } }),
})
act(() => { button().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
await act(async () => { await advance(0) })
console.log('after run:', titleOf(), '| writes:', JSON.stringify(writes))
if (titleOf() !== '撤回优化') { console.error('FAIL: 完成后应变成撤回态'); process.exit(1) }
if (writes[0] !== '优化后的提示词正文') { console.error('FAIL: 结果应写回草稿'); process.exit(1) }

// 3) 把设置里的窗口改成 5 毫秒并广播 —— 撤回态应在 5ms 后自行过期
undoWindowMs = 5
for (const listener of settingsListeners) listener()
await act(async () => {
  render()
  await advance(30)
})
console.log('after ttl:', titleOf())
if (titleOf() !== '优化提示词') { console.error('FAIL: 撤回态应按设置的窗口过期'); process.exit(1) }

// 4) 再跑一次，并在过期前点击撤回箭头 → 应还原"这次优化前的草稿"
writes.length = 0
undoWindowMs = 60000
for (const listener of settingsListeners) listener()
const beforeSecondRun = inputState.draft
act(() => { button().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
await act(async () => { await advance(0) })
if (titleOf() !== '撤回优化') { console.error('FAIL: 第二次优化后应处于撤回态'); process.exit(1) }
act(() => { button().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
console.log('after undo:', titleOf(), '| restored:', JSON.stringify(writes))
if (writes[0] !== beforeSecondRun) { console.error('FAIL: 撤回应还原原文（期望 ' + beforeSecondRun + '）'); process.exit(1) }
if (titleOf() !== '优化提示词') { console.error('FAIL: 撤回后应回到空闲态'); process.exit(1) }

globalThis.fetch = originalFetch
console.log('PASS: 撤回窗口读取设置、过期与还原行为均正确')
process.exit(0)