/**
 * 仿真测试：模拟 dsh 浏览器外壳的模块加载器 + 渲染器的 hook 绑定规则，
 * 加载真实的 lib/client.js，检查注册是否成立、组件能否渲染。
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

// --- 1) 模拟 window.__ModuleLoader__ ---
let registration
globalThis.window = {
  __ModuleLoader__: {
    load(reg) { registration = reg },
  },
}

// --- 2) 模拟 document（ensureStyles 会插入 <style>） ---
const head = { children: [], append(el) { this.children.push(el) } }
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '' }),
  head,
}

// --- 3) 加载真实产物 ---
const code = readFileSync(resolve(import.meta.dirname ?? '.', '../lib/client.js'), 'utf8')
// 模块加载器在浏览器里是 CJS 风格：用一个 require 映射到真实依赖
const localRequire = (spec) => require(spec)
new Function('window', 'document', 'require', 'module', 'exports', code)(
  globalThis.window, globalThis.document, localRequire, { exports: {} }, {},
)
console.log('[1] factory 注册:', registration?.id)

const mod = registration.factory((spec) => require(spec))
console.log('[2] 模块导出:', Object.keys(mod).join(', '), '| name =', mod.name, '| inject =', JSON.stringify(mod.inject))

// --- 4) 模拟客户端 Cordis 上下文：捕获 slots 注册 ---
// 插件会对多个插槽注册同一条目；这里收集全部注册，取第一个带 inject 面的做断言。
const registrations = []
const fakeSlots = {
  inject(key, factory) {
    console.log('[3] slots.inject 于:', key)
    const result = factory()
    console.log('[4] register 返回:', typeof result)
  },
  register(options, component) {
    console.log('[5] register options:', JSON.stringify({ ...options, inject: undefined }))
    registrations.push({ options, component })
    return () => {}
  },
}
const services = {
  slots: fakeSlots,
  modelDirectories: {
    directoryFor: () => ({
      store: {
        getSnapshot: () => ({ current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } }),
        subscribe: () => () => {},
      },
    }),
  },
  // dsh 0.1.7 的客户端设置镜像：每个插件条目一份表单快照（entryId === 命名空间）。
  configForms: {
    get: (entryId) => ({
      getSnapshot: () => ({ value: entryId === 'prompt-polish' ? { undoWindowMs: 90000 } : undefined }),
      subscribe: () => () => {},
    }),
  },
}
/*
 * 客户端 cordis 上下文：真实外壳里，模块 `inject` 里声明的服务既能在
 * `ctx.inject(deps, cb)` 的 scope 上读到，也能直接作为 ctx 的属性读到
 * （客户端插件用 `ctx.configForms.get(...)` 这种直读写法）。这里两种都提供。
 */
const fakeCtx = {
  ...services,
  inject(deps, callback) {
    const scope = {}
    for (const d of deps) scope[d] = services[d]
    return callback(scope)
  },
  effect(fn) { return fn() },
}
mod.apply(fakeCtx)

// --- 5) 逐个渲染每个注册：归属机制应保证"只有一个插槽输出按钮" ---
if (registrations.length === 0) { console.log('FAIL: 没有任何插槽注册成功'); process.exit(1) }
// 模块必须在 inject 里声明 dsh 0.1.7 的设置镜像服务（旧 settingsScope 已被删除）。
if (!Array.isArray(mod.inject) || !mod.inject.includes('configForms')) {
  console.log('FAIL: 客户端 inject 未声明 configForms，实际 =', JSON.stringify(mod.inject))
  process.exit(1)
}
console.log('[3b] inject 已声明 configForms（0.1.7 设置镜像服务）')
console.log('[4b] 注册数:', registrations.length)
const renderOne = (entry) => {
  const injectFace = typeof entry.options.inject === 'function' ? entry.options.inject('session-1') : {}
  const props = { ...injectFace, slotName: entry.options.slotName ?? entry.options.name, t: (k) => k }
  for (const [name, source] of Object.entries(injectFace.hooks ?? {})) {
    const hookName = 'use' + name.charAt(0).toUpperCase() + name.slice(1)
    props[hookName] = (selector) => selector(source.getSnapshot())
  }
  props.useInput = (selector) => selector({ draft: '帮我改一下登录页按钮颜色', phase: 'plain', occurrences: [], attachmentIds: [] })
  props.inputActions = { setDraft: (t) => console.log('[7] setDraft 被调用:', t.slice(0, 40)) }
  return renderToStaticMarkup(React.createElement(entry.component, props))
}
let rendered = 0
let sample = ''
for (const entry of registrations) {
  try {
    const html = renderOne(entry)
    if (html.length > 0) rendered += 1
    if (sample === '' && html.length > 0) sample = html
    console.log('[8]', entry.options.name, '->', html.length, 'bytes')
  } catch (error) {
    console.log('[8]', entry.options.name, '渲染失败:', error.message)
  }
}
console.log(rendered === 1 ? '[9] PASS：恰好一个插槽渲染出按钮' : '[9] FAIL：渲染按钮的插槽数 = ' + rendered)
console.log('    ', sample.slice(0, 200))

// --- 6) 设置镜像：撤回窗口必须取自 configForms（而不是已被删除的 settingsScope） ---
const diagnostics = globalThis.__dshPromptPolish
if (diagnostics?.settingsMirror !== 'bound') {
  console.log('FAIL: 设置镜像未绑定 configForms，diagnostics =', JSON.stringify(diagnostics))
  process.exit(1)
}
// 撤回窗口必须真的读到了设置里的值（mock 返回 90000），而不是兜底的 60000。
if (diagnostics.undoWindowMs !== 90000) {
  console.log('FAIL: 撤回窗口未取到设置值，diagnostics =', JSON.stringify(diagnostics))
  process.exit(1)
}
if (code.includes('settingsScope')) {
  console.log('FAIL: 产物里仍引用已被删除的 settingsScope 服务')
  process.exit(1)
}
console.log('[10] PASS：撤回窗口镜像绑定 configForms 且读到 undoWindowMs =', diagnostics.undoWindowMs)

if (rendered !== 1) process.exit(1)

