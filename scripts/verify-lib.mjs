/**
 * 校验"提交的 lib/ 与 src/ 同步"：在项目内的临时目录里重新构建，逐字节比较。
 * CI 用它拒绝"改了源码没重新构建"的提交。
 * （产物头部是源码内容哈希而非时间戳，所以逐字节比较才有意义。）
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
// 临时目录放在项目内：这样重新构建时 Node 能沿目录向上找到本仓库的 node_modules。
const tmp = mkdtempSync(join(root, '.verify-lib-'))

try {
  for (const entry of ['src', 'scripts', 'package.json']) {
    cpSync(join(root, entry), join(tmp, entry), { recursive: true })
  }
  execFileSync(process.execPath, [join(tmp, 'scripts', 'build.mjs')], { cwd: tmp, stdio: 'inherit' })

  let failed = false
  for (const file of ['index.js', 'client.js']) {
    const committed = readFileSync(join(root, 'lib', file), 'utf8')
    const rebuilt = readFileSync(join(tmp, 'lib', file), 'utf8')
    const same = committed === rebuilt
    console.log((same ? 'OK    ' : 'DRIFT ') + 'lib/' + file)
    if (!same) failed = true
  }
  if (failed) {
    console.error('lib/ is out of sync with src/ — run "pnpm run build" and commit the result.')
    process.exitCode = 1
  } else {
    console.log('lib/ matches src/')
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
