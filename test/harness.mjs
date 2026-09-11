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
  settingsScope: {
    bind: () => ({
      getSnapshot: () => ({ value: { undoWindowMs: 60000 } }),
      subscribe: () => () => {},
    }),
  },
}
const fakeCtx = {
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
