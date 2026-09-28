/**
 * 客户端 bundle 信封 id 的回归测试。
 *
 * dsh 的客户端模块图按**安装的那份 package.json 的 name** 建行
 * （`@deepseek-ai/dsh-client-modules` 的 `nearestPackage()` 找最近的 package.json），
 * 官方客户端作者文档也写明 bundle "registers a lazy factory whose id equals the
 * package name"。两者不一致时加载器认为该行没有注册，于是回退到单文件 URL
 * **再执行一次**，外壳抛：
 *
 *   client-modules: duplicate factory registration for "<bundle 注册的 id>"
 *   (bundle executed twice without invalidate?)
 *
 * 并伴随 `could not load "<行 id>" ... loaded without registering`（客户端半永不激活）。
 * 复现过的真实场景：把本仓库的 `lib/` 拷进一个 rename 过的本地开发副本
 * （package.json#name = `dsh-prompt-polish`）。详见 docs/compatibility.md 的「实测结论」7。
 *
 * 这里钉住两件事：
 *   1. 提交的 `lib/client.js` 注册的 id 必须等于本包的 `name`；
 *   2. `--client-id <name>` 能为"改名安装"的副本构建出正确产物。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/**
 * 取出 `window.__ModuleLoader__.load({ id: "...", factory ... })` 里的 id 字面量。
 * @param source - bundle 源码。
 * @returns 信封里注册的模块 id。
 */
function envelopeId(source) {
  const match = /__ModuleLoader__\.load\(\{\s*id:\s*"((?:[^"\\]|\\.)*)"/.exec(source)
  assert.ok(match, 'bundle 必须以 window.__ModuleLoader__.load({ id, factory }) 信封开头')
  return JSON.parse(`"${match[1]}"`)
}

// ── 1. 提交的产物：信封 id 必须等于本包名 ─────────────────────────────────
const committed = readFileSync(join(root, 'lib/client.js'), 'utf8')
assert.equal(envelopeId(committed), pkg.name, `lib/client.js 注册的 id 必须是 ${pkg.name}（= package.json#name）`)
assert.equal(committed.match(/__ModuleLoader__\.load\(/g).length, 1, '一个 bundle 只能注册一次')
console.log('[1] 提交的 lib/client.js 注册 id =', pkg.name)

// ── 2. --client-id：为"用别的名字安装"的副本构建产物 ──────────────────────
// 临时目录放在仓库内，重新构建时 Node 才能沿目录向上找到本仓库的 node_modules。
const tmp = mkdtempSync(join(root, '.verify-envelope-'))
const alternate = 'dsh-prompt-polish'
try {
  for (const entry of ['src', 'scripts', 'package.json']) {
    cpSync(join(root, entry), join(tmp, entry), { recursive: true })
  }
  execFileSync(process.execPath, [join(tmp, 'scripts', 'build.mjs'), '--client-id', alternate], { cwd: tmp, stdio: 'inherit' })

  assert.equal(envelopeId(readFileSync(join(tmp, 'lib/client.js'), 'utf8')), alternate, '--client-id 必须改掉信封里注册的 id')
  // 宿主半不 stamp 模块 id：改了 --client-id 也不该动 lib/index.js。
  assert.equal(
    readFileSync(join(tmp, 'lib/index.js'), 'utf8'),
    readFileSync(join(root, 'lib/index.js'), 'utf8'),
    '--client-id 只影响浏览器半，lib/index.js 必须逐字节不变',
  )
  console.log('[2] --client-id', alternate, '构建出的产物注册 id =', alternate, '（lib/index.js 未变）')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
