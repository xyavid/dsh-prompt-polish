/**
 * dsh 运行时版本兼容性的回归测试（0.2.0-rc.1 的门禁）。
 *
 * dsh 0.2.0-rc.1 起，app-boot 在装载 profile bundle 时会先跑
 * `evaluatePluginCompatibility()`（`dsh-app-boot/lib/index.js:286-323`）：把该 bundle
 * `package.json#peerDependencies` 里所有 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*`
 * 的 range 取出来，与**运行中的 dsh 版本**做 semver 比对，且带
 * `{ includePrerelease: true }`。任何一条不满足，`loadProfileDirectory()`
 * （同文件 925-945 行）就抛错**并把整个 bundle 丢进 `skippedBundles`**——异常在那里
 * 被 catch 掉，所以插件是**静默消失**，UI 上只表现为"按钮不见了"。
 *
 * 语言陷阱：`^0.1.7-rc.1` 的语义是 `>=0.1.7-rc.1 <0.2.0`，**永远不包含 0.2.0-rc.1**，
 * 加不加 includePrerelease 都一样。0.3.0 及以前本插件三条 dsh 依赖都写成
 * `^0.1.7-rc.1`，于是在 0.2.0-rc.1 上被整包跳过。注意 `dsh.engines.dsh` 那个字段
 * **不参与**这道门禁（门禁只读 peerDependencies），但它是对外声明，也要写对。
 *
 * 这里钉住四件事：
 *   1. 每条 `@deepseek-ai/dsh*` peer 都必须同时接纳 0.1.7 线与 0.2.0 线；
 *   2. `dsh.engines.dsh` 同样必须接纳这两条线；
 *   3. devDependencies 里真实安装的 dsh 版本必须落在被接纳的版本里（防止"升了 devDeps
 *      却忘了放宽 peer"这类回归——这正是 0.3.0 踩的坑）；
 *   4. 用修好之前的 range 复现一次，证明本测试确实能抓住这个回归。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import semver from 'semver'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/**
 * 本插件声明支持的 dsh 运行时版本（`dsh.engines.dsh` 两条线的代表版本，
 * 范围无法枚举，所以显式列出）。
 */
const SUPPORTED_DSH = ['0.1.7-rc.1', '0.1.7-rc.2', '0.2.0-rc.1']

/** 被这道门禁检查的 peer 名：`@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*`。 */
const DSH_PEER = /^@deepseek-ai\/dsh(?:-|$)/

/**
 * 复刻 dsh 的 `evaluatePluginCompatibility`：返回不满足的 peer 映射，全部满足时 undefined。
 * @param manifest - 待检查的 package.json 内容。
 * @param runtimeVersion - 运行中的 dsh 版本。
 * @returns 不兼容的 peer（name → range），或 undefined。
 */
function incompatiblePeers(manifest, runtimeVersion) {
  const peers = {}
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (!DSH_PEER.test(name)) continue
    if (!semver.satisfies(runtimeVersion, range, { includePrerelease: true })) peers[name] = range
  }
  return Object.keys(peers).length === 0 ? undefined : peers
}

// ── 1. 声明出去的范围必须接纳两条 dsh 线 ───────────────────────────────────
const dshPeers = Object.keys(pkg.peerDependencies ?? {}).filter((name) => DSH_PEER.test(name))
assert.ok(dshPeers.length > 0, '插件必须声明至少一条 @deepseek-ai/dsh* peer')
for (const runtime of SUPPORTED_DSH) {
  const bad = incompatiblePeers(pkg, runtime)
  assert.equal(
    bad,
    undefined,
    `dsh ${runtime} 会被 app-boot 判为不兼容并静默跳过整个 bundle；不满足的 peer：${JSON.stringify(bad)}`,
  )
}
console.log('[1]', dshPeers.length, '条 dsh peer 同时接纳', SUPPORTED_DSH.join(' / '))

// ── 2. dsh.engines.dsh 是对外声明，同样要接纳两条线 ────────────────────────
const enginesRange = pkg.dsh?.engines?.dsh
assert.equal(typeof enginesRange, 'string', 'package.json 必须声明 dsh.engines.dsh')
for (const runtime of SUPPORTED_DSH) {
  assert.ok(
    semver.satisfies(runtime, enginesRange, { includePrerelease: true }),
    `dsh.engines.dsh = ${JSON.stringify(enginesRange)} 不接纳 ${runtime}`,
  )
}
console.log('[2] dsh.engines.dsh =', enginesRange, '接纳', SUPPORTED_DSH.join(' / '))

// ── 3. 开发/测试环境真实装到的 dsh 版本也必须被接纳 ────────────────────────
// 这一步专门防"升了 devDependencies 却忘了放宽 peerDependencies"：
// 用 node_modules 里实际装的那份 package.json 去跑同一道门禁。
for (const name of dshPeers) {
  let installed
  try {
    installed = JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'))
  } catch {
    continue // 未安装（例如只装生产依赖）时跳过
  }
  assert.equal(
    incompatiblePeers(pkg, installed.version),
    undefined,
    `node_modules 里装的是 ${name}@${installed.version}，但 peer range 不接纳它——` +
        '升 devDependencies 时必须同步放宽 peerDependencies（0.3.0 的回归就是这个）',
  )
  assert.ok(
    SUPPORTED_DSH.includes(installed.version) || semver.satisfies(installed.version, enginesRange, { includePrerelease: true }),
    `${name}@${installed.version} 不在声明支持的 dsh 版本里`,
  )
}
console.log('[3] node_modules 里实际安装的', dshPeers.length, '个 dsh 包版本均被当前声明接纳')

// ── 4. 复现修好之前的写法：门禁必须报不兼容（证明本测试有效） ──────────────
const legacy = {
  name: pkg.name,
  version: pkg.version,
  peerDependencies: {
    ...pkg.peerDependencies,
    '@deepseek-ai/dsh-host-webserver': '^0.1.7-rc.1',
    '@deepseek-ai/dsh-llm': '^0.1.7-rc.1',
    '@deepseek-ai/dsh-session': '^0.1.7-rc.1',
  },
}
const legacyBad = incompatiblePeers(legacy, '0.2.0-rc.1')
assert.notEqual(legacyBad, undefined, '旧写法 ^0.1.7-rc.1 在 0.2.0-rc.1 上必须被判为不兼容')
assert.equal(incompatiblePeers(legacy, '0.1.7-rc.1'), undefined, '旧写法在它自己那代（0.1.7）上应是通过的')
console.log('[4] 旧写法 ^0.1.7-rc.1 在 0.2.0-rc.1 上被正确判为不兼容：', JSON.stringify(legacyBad))

console.log('PASS：dsh 运行时兼容性（peer 门禁）回归测试通过')
