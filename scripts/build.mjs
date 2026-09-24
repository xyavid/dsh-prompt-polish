/**
 * 构建插件两半，输出成 dsh Web 组合实际加载的形态：
 *
 * - lib/index.js  —— Node 半：普通 ESM，所有裸导入保持 external，
 *                    由 dsh 的模块解析（安装目录 / profile 的 node_modules）负责。
 * - lib/client.js —— 浏览器半：CJS，包在 window.__ModuleLoader__.load({ id, factory })
 *                    信封里；react 由 Web 外壳的模块表满足，不打包进去。
 *
 * 产物头部写入【源码内容哈希】：内容不变 → 产物逐字节一致（CI 可校验提交的 lib/
 * 是否与 src/ 同步）；内容一变 → 哈希变 → 服务端给 bundle 的 rev 变 → 浏览器不会
 * 命中旧缓存。刻意不用时间戳：时间戳会让每次构建都不同，无法做产物校验。
 */
import { context } from 'esbuild'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const watch = process.argv.includes('--watch')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

/**
 * 递归收集目录下所有文件（按路径排序，保证哈希稳定）。
 * @param dir - 起始目录。
 * @returns 绝对路径列表。
 */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

/**
 * 计算一组文件的内容哈希（相对路径 + 内容一起入哈希）。
 *
 * 路径先归一成 `/` 分隔：Windows 的 `path.join` 产出 `\`，Linux 产出 `/`，
 * 而同一份源码必须在两个平台算出同一个指纹——否则提交的 `lib/` 只在
 * 构建它的那个平台上通过 `verify:lib`（换平台必然报 DRIFT）。
 * @param files - 绝对路径列表。
 * @returns 12 位十六进制摘要。
 */
function contentHash(files) {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(relativePath(file))
    hash.update(readFileSync(file))
  }
  return hash.digest('hex').slice(0, 12)
}

/**
 * 仓库内相对路径，统一成 `/` 分隔（跨平台指纹稳定的关键）。
 * @param file - 绝对路径。
 * @returns 形如 `/src/index.ts` 的相对路径。
 */
function relativePath(file) {
  return file.slice(root.length).replaceAll('\\', '/')
}

/** 仓库地址（去掉 git+ 前缀与 .git 后缀）；未填写占位符时为空串。 */
const repoUrl = String(pkg.repository?.url ?? '')
  .replace(/^git\+/, '')
  .replace(/\.git$/, '')
  .replace(/github\.com\/<your-account>\//, 'github.com/')

const hostHash = contentHash(walk(resolve(root, 'src')))
const clientHash = contentHash(
  walk(resolve(root, 'src/client')).concat(resolve(root, 'src/protocol.ts'), resolve(root, 'src/prompts.ts')),
)

/** Node 半：ESM + 全外置。 */
const hostOptions = {
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: resolve(root, 'lib/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  packages: 'external',
  logLevel: 'info',
  banner: { js: `// source-hash ${hostHash}\n` },
}

/** 浏览器半：模块加载器信封 + react 外置。 */
const clientOptions = {
  entryPoints: [resolve(root, 'src/client/index.tsx')],
  outfile: resolve(root, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  // 关键：JSX 必须用 automatic runtime（产出 require("react/jsx-runtime")）。
  // 默认的 classic runtime 会引用未定义的全局 React，组件一渲染就抛
  // "React is not defined"，表现为按钮静默不出现。
  jsx: 'automatic',
  packages: 'external',
  legalComments: 'none',
  sourcemap: false,
  logLevel: 'info',
  // 发布自查用：把仓库地址编进产物；源码检出未替换占位符时是空串。
  define: { __DSH_PP_REPO_URL__: JSON.stringify(repoUrl) },
  banner: {
    js: `// source-hash ${clientHash}\nwindow.__ModuleLoader__.load({\n\tid: ${JSON.stringify(pkg.name)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n`,
  },
  footer: { js: '\n\t\treturn module.exports;\n\t}\n});\n' },
}

const host = await context(hostOptions)
const client = await context(clientOptions)
if (watch) {
  await host.watch()
  await client.watch()
  console.log('[dsh-prompt-polish] watching…')
} else {
  await host.rebuild()
  await client.rebuild()
  await host.dispose()
  await client.dispose()
  console.log(`[dsh-prompt-polish] built lib/index.js (${hostHash}) + lib/client.js (${clientHash})`)
}
