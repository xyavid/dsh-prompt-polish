/**
 * dsh-prompt-polish 的浏览器半：
 * 在 composer 工具行的模型名左侧注册一个小星星按钮。
 *
 * 位置：优先 'conversation.input.right'（list / session 作用域）——它在"模型"
 * 座席（conversation.input.model）之前渲染，落在模型名紧邻左侧；该插槽缺失时
 * 依次回退到 left / plan / dock。list 按 order 排序、由外层 flex 行自适应，
 * 窗口变窄时随行收缩，不做任何坐标定位。
 *
 * 按钮是三态的：
 *   空闲 → 点一下优化；优化中 → 点一下取消；已优化 → 点一下恢复原文。
 * 优化只会在**成功那一刻**写草稿，所以"取消"天然不会碰到用户正在敲的内容；
 * 优化期间用户改了草稿则结果不覆盖，改为底部提示条供手动采用。
 *
 * 数据：session 作用域 slot 自动获得标准 props —— useInput（读草稿）与
 * inputActions.setDraft（写草稿，并入编辑器撤销历史）。当前模型经
 * ctx.modelDirectories 读取，与会话里的"模型"座席共享同一份状态。
 * @module dsh-prompt-polish/client
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ensureStyles } from './styles'
import { OPTIMIZE_ENDPOINT, type OptimizeError, type OptimizeResponse } from '../protocol'
import { normalizeEnhanceText } from '../prompts'

/** 注入的服务：slots 必需；modelDirectories 可选（拿不到就让宿主兜底路由）。 */
export const inject = ['slots']

/** 浏览器半所需的输入状态面（来自 slot 标准 props）。 */
interface InputStateLike {
  draft: string
  phase: string
  occurrences: readonly unknown[]
  attachmentIds: readonly unknown[]
}

/** 会话作用域 slot 的标准 props（只声明用到的字段）。 */
interface ConversationInputProps {
  useInput: <T>(selector: (state: InputStateLike) => T) => T
  inputActions: { setDraft(text: string): void }
}

/**
 * 组件 props：只用 session 作用域 slot 的标准 props。
 * 当前模型不在这里读取（外壳对未声明服务的读取会抛错），改由宿主半
 * 按"会话最近请求的模型 → 跨进程默认模型"兜底。
 */
type Props = ConversationInputProps

interface ModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/**
 * 运行时诊断：任何一步失败都记在这里，并同步到 window.__dshPromptPolish，
 * 让"按钮不出现"这类静默问题有一个可查的证据。
 */
interface Diagnostics {
  stage: string
  slotsInjected: boolean
  registered: boolean
  /** 实际注册成功的插槽 key。 */
  slot?: string
  /** 每个候选插槽的尝试结果（含失败原因）。 */
  attempts: string[]
  /** 实际挂载了按钮的插槽（可能有多个候选同时成立）。 */
  mounted: string[]
  /** inject 回调拿到的 scope 上的键（用于确认服务是否可见）。 */
  services?: string[]
  /** slots 服务的形状（inject/register 的 typeof）。 */
  slotsShape?: string
  /** 通过 ctx.get() 成功拿到的可选服务名。 */
  optionalVia?: string
  hookChanges: number
  errors: string[]
}
const diagnostics: Diagnostics = { stage: 'module-loaded', slotsInjected: false, registered: false, attempts: [], mounted: [], hookChanges: 0, errors: [] }

/** 把诊断同步到全局，供页面控制台直接查看。 */
function publish(): void {
  if (typeof globalThis !== 'undefined') {
    ;(globalThis as Record<string, unknown>).__dshPromptPolish = diagnostics
  }
}

/**
 * 记录一个阶段（可选错误）并同步到全局诊断。
 * @param stage - 阶段名。
 * @param error - 该阶段的异常（可选）。
 */
function report(stage: string, error?: unknown): void {
  diagnostics.stage = stage
  if (error !== undefined) {
    diagnostics.errors.push(error instanceof Error ? error.message : String(error))
  }
  publish()
  if (error !== undefined) console.error('[prompt-polish]', stage, error)
  else console.info('[prompt-polish]', stage)
}
report('module-loaded')

/**
 * 发布占位自查：由构建脚本用 `--define` 注入真实仓库地址。
 * 直接源码运行（未替换）会返回空串，据此在控制台给出一次警告。
 */
declare const __DSH_PP_REPO_URL__: string
const REPO_URL = typeof __DSH_PP_REPO_URL__ === 'string' ? __DSH_PP_REPO_URL__ : ''

/**
 * 撤回窗口：优先用宿主设置里的 `undoWindowMs`（`settingsScope` 镜像），
 * 读不到时退回 60 秒。
 *
 * 不依赖"自定义 inject face 的 hooks"：那是 schema 中唯一的字段来源，
 * 但部分外壳不渲染这类注入面，会让 `undoWindowMs` 永远拿不到值。
 * 因此这里在客户端半的 `ctx` 上读一次设置，并用全局存储 + 无参订阅把值
 * 接进组件（订阅只用于让 React 重新渲染，不关心载荷）。
 */
const UNDO_KEY = Symbol.for('dsh-prompt-polish.undo-window')
const UNDO_FALLBACK_MS = 60000
/** 设置命名空间名（与 cordis.patch.yml / config.ts 保持一致）。 */
const SETTINGS_NAMESPACE = 'prompt-polish'
/** 监听器集合：仅用于触发重渲染。 */
const undoListeners = new Set<() => void>()

/** 全局撤回窗口存储（跨模块实例共享，避免两份状态不一致）。 */
function undoStore(): { ms: number | undefined } {
  const store = globalThis as unknown as Record<symbol, { ms: number | undefined } | undefined>
  store[UNDO_KEY] ??= { ms: undefined }
  return store[UNDO_KEY] as { ms: number | undefined }
}

/**
 * 撤回窗口（毫秒）；`0` 表示不过期。未读到设置时为 undefined（组件用兜底值）。
 * @returns 当前窗口毫秒数，或 undefined。
 */
function undoWindowValue(): number | undefined {
  return undoStore().ms
}

/**
 * 订阅撤回窗口变化（无需载荷，仅用于重渲染）。
 * @param listener - 变更回调。
 * @returns 取消订阅。
 */
function subscribeUndoWindow(listener: () => void): () => void {
  undoListeners.add(listener)
  return () => {
    undoListeners.delete(listener)
  }
}

/**
 * 写入撤回窗口并广播。
 * @param ms - 新的窗口毫秒数。
 */
function publishUndoWindow(ms: number | undefined): void {
  const store = undoStore()
  if (store.ms === ms) return
  store.ms = ms
  for (const listener of undoListeners) listener()
}

/**
 * 把宿主设置里的 `undoWindowMs` 接进来。
 * @param raw - 设置服务返回的原始值。
 * @returns 是否成功解析。
 */
function adoptUndoWindow(raw: unknown): boolean {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return false
  publishUndoWindow(raw)
  return true
}

/** 失败码 → 中文提示。 */
const ERROR_TEXT: Record<string, string> = {
  rejected: '无法优化这条输入',
  timeout: '优化超时',
  aborted: '已取消优化',
  unconfigured: '未找到可用模型，请先在会话里选择模型',
  upstream: '模型调用失败',
  internal: '插件内部错误',
}

/** 提交一次优化请求。 */
async function requestOptimize(
  body: { text: string; sessionId?: string; selection?: ModelSelection },
  signal: AbortSignal,
): Promise<{ ok: true; text: string } | { ok: false; detail: OptimizeError }> {
  let response: Response
  try {
    response = await fetch(OPTIMIZE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal.aborted) return { ok: false, detail: { code: 'aborted' } }
    return { ok: false, detail: { code: 'internal', message: error instanceof Error ? error.message : String(error) } }
  }
  let payload: OptimizeResponse
  try {
    payload = (await response.json()) as OptimizeResponse
  } catch {
    return { ok: false, detail: { code: 'internal', message: '宿主返回了非 JSON 响应' } }
  }
  if (payload.ok) return { ok: true, text: payload.value.text }
  return { ok: false, detail: payload.error }
}

/**
 * 三态按钮：空闲 = 四角星，优化中 = 转圈（点击取消），完成后**同一个按钮**变成撤回箭头
 * （点击恢复原文）。不产生任何额外的提示框/提示条。
 */
function PolishButton(props: Props): ReactNode {
  const { useInput, inputActions } = props
  const draft = useInput((state) => state.draft)
  const phase = useInput((state) => state.phase)
  const occurrences = useInput((state) => state.occurrences.length)
  // 撤回窗口来自宿主设置（settingsScope 镜像）；读不到时用兜底值。
  const undoWindowMs = useSyncExternalStore(subscribeUndoWindow, undoWindowValue, undoWindowValue) ?? UNDO_FALLBACK_MS
  diagnostics.hookChanges += 1
  if (diagnostics.stage !== 'rendering') report('rendering')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  /** 完成后进入撤回态：记录优化前原文与写回去的结果。 */
  const [undo, setUndo] = useState<{ original: string; applied: string } | undefined>(undefined)
  const requestRef = useRef(0)
  const abortRef = useRef<AbortController | undefined>(undefined)

  // 会话/挂载卸载时取消在途请求，避免迟到结果写入别的会话。
  useEffect(() => () => {
    requestRef.current += 1
    abortRef.current?.abort()
  }, [])

  const draftRef = useRef(draft)
  draftRef.current = draft

  // 用户手动改动了草稿 → 撤回不再有意义，按钮回到空闲态（下次点击是"优化"）。
  useEffect(() => {
    if (undo !== undefined && draft !== undo.applied) setUndo(undefined)
  }, [draft, undo])

  const run = useCallback(() => {
    if (busy) return
    // chip 尾随的零宽空格不算正文：只有附件/chip 时按空输入处理。
    const cleaned = normalizeEnhanceText(draft)
    if (cleaned === '') {
      setError('请先输入内容')
      return
    }
    if (occurrences > 0) {
      setError('含 / 命令或 @ 引用的输入暂不支持优化')
      return
    }
    if (phase !== 'plain') {
      setError('当前输入状态不允许优化')
      return
    }
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(undefined)
    setUndo(undefined)
    // 原文快照保留未清洗的草稿：撤回时逐字还原用户当时写的东西。
    const snapshot = draft
    void requestOptimize({ text: cleaned }, controller.signal).then((result) => {
      if (requestRef.current !== requestId) return
      setBusy(false)
      abortRef.current = undefined
      if (!result.ok) {
        if (result.detail.code === 'aborted') return
        setError(result.detail.message ?? ERROR_TEXT[result.detail.code] ?? '优化失败')
        return
      }
      // 期间用户改了草稿 → 不覆盖输入，按钮保持空闲；原因放在按钮悬停提示里。
      if (draftRef.current !== snapshot) {
        setError('优化期间草稿已改动，结果未采用')
        return
      }
      inputActions.setDraft(result.text)
      // 只在结果确实写回草稿后才进入撤回态。
      setUndo({ original: snapshot, applied: result.text })
    })
  }, [busy, draft, inputActions, occurrences, phase])

  /** 优化中点击：取消在途请求。草稿只在成功时被写过，所以这里不需要还原。 */
  const cancel = useCallback(() => {
    requestRef.current += 1
    abortRef.current?.abort()
    abortRef.current = undefined
    setBusy(false)
    setError(undefined)
  }, [])

  /** 已优化：恢复原文并回到空闲态。 */
  const restore = useCallback(() => {
    if (undo === undefined) return
    if (draftRef.current === undo.applied) inputActions.setDraft(undo.original)
    setUndo(undefined)
  }, [inputActions, undo])

  // 撤回入口按设置里的窗口自动过期（0 = 一直保留到手动撤回）。
  useEffect(() => {
    if (undo === undefined) return
    if (undoWindowMs === undefined || undoWindowMs <= 0) return
    const timer = setTimeout(() => setUndo(undefined), undoWindowMs)
    return () => clearTimeout(timer)
  }, [undo, undoWindowMs])

  const canUndo = undo !== undefined
  const empty = normalizeEnhanceText(draft) === ''
  const disabled = !busy && !canUndo && empty
  const title = busy
    ? '取消优化'
    : canUndo
      ? '撤回优化'
      : error === undefined
        ? '优化提示词'
        : `优化失败：${error}（点击重试）`
  const onClick = busy ? cancel : canUndo ? restore : run
  const className = [
    'dsh-pp-btn',
    busy ? 'is-busy' : '',
    canUndo ? 'is-revert' : '',
    error !== undefined && !busy && !canUndo ? 'is-error' : '',
  ].filter((part) => part !== '').join(' ')

  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={title}
      aria-busy={busy}
      disabled={disabled}
      onClick={onClick}
    >
      {busy ? <SpinnerIcon /> : canUndo ? <RevertIcon /> : <SparkIcon />}
    </button>
  )
}

/** 四角星（与"优化/魔法"语义一致）。 */
function SparkIcon(): ReactNode {
  return (
    <svg className="dsh-pp-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.2l1.9 4.6a3 3 0 0 0 1.7 1.7l4.6 1.9-4.6 1.9a3 3 0 0 0-1.7 1.7L12 19.6l-1.9-4.6a3 3 0 0 0-1.7-1.7L3.8 11.4l4.6-1.9a3 3 0 0 0 1.7-1.7L12 3.2z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      <path d="M18.5 3.5l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7.7-1.7z" fill="currentColor" />
    </svg>
  )
}

/** 转圈（优化进行中；此时点击按钮 = 取消）。 */
function SpinnerIcon(): ReactNode {
  return (
    <svg className="dsh-pp-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" opacity="0.25" />
      <path d="M20 12a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** 回转箭头（已优化 → 点一下恢复原文）。 */
function RevertIcon(): ReactNode {
  return (
    <svg className="dsh-pp-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9h9.5a5 5 0 0 1 0 10H8"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M7.5 5.5L4 9l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 空订阅（拿不到模型目录时的兜底）。 */
const NO_SELECTION = (): (() => void) => () => {}

/**
 * 挂载浏览器半。
 * @param ctx - 浏览器端 Cordis 上下文。
 */
export function apply(ctx: { inject(deps: string[], callback: (scope: never) => unknown): void; effect(callback: () => unknown, label?: string): void }): void {
  try {
    applyInner(ctx)
  } catch (error) {
    // 外壳只吞渲染失败，所以这里必须自己留痕：任何异常都写进诊断与控制台。
    report('apply-threw', error)
  }
}

/**
 * 真正的挂载逻辑（由 apply 包裹，保证异常可观测）。
 * @param ctx - 浏览器端 Cordis 上下文。
 */
function applyInner(ctx: { inject(deps: string[], callback: (scope: never) => unknown): void; effect(callback: () => unknown, label?: string): void }): void {
  try {
    ensureStyles()
    report('styles-ready')
  } catch (error) {
    report('styles-failed', error)
  }
  /*
   * 设置镜像（只取"撤回窗口"一个字段）：在客户端半的 ctx 上绑定命名空间，
   * 而不是通过"自定义 inject face 的 hooks"——后者在外壳下可能整段不渲染。
   * 每次 apply 都用新对象 bind：官方文档明确要求按调用方生命周期绑定，
   * 复用旧 scope 会在热重载后读到失效的镜像。
   */
  ctx.inject(['settingsScope'], (scopeCtx: never) => {
    try {
      const settings = (scopeCtx as {
        settingsScope: {
          bind(spec: { namespace: string }): {
            getSnapshot(): { value?: { undoWindowMs?: number } }
            subscribe(listener: () => void): () => void
          }
        }
      }).settingsScope.bind({ namespace: SETTINGS_NAMESPACE })
      if (!adoptUndoWindow(settings.getSnapshot().value?.undoWindowMs)) publishUndoWindow(UNDO_FALLBACK_MS)
      const stop = settings.subscribe(() => {
        adoptUndoWindow(settings.getSnapshot().value?.undoWindowMs)
      })
      ctx.effect(() => stop, 'dsh-prompt-polish: undo-window mirror')
    } catch (error) {
      report('settings-mirror-failed', error)
      publishUndoWindow(UNDO_FALLBACK_MS)
    }
  })

  ctx.inject(['slots'], (slotsCtx: never) => {
    // 整个回调体包在 try/catch 里：外壳会吞掉这里的异常，必须自己留痕。
    try {
      diagnostics.slotsInjected = true
      report('slots-injected')
      const scope = slotsCtx as Record<string, unknown> & { get?(name: string): unknown }
      diagnostics.services = Object.keys(scope)
      /*
       * 服务读取必须受保护：scope 是严格代理，未在 inject 中声明的服务
       * 直接属性访问会抛 "cannot get property X without inject"，
       * 并会中断整个回调（外壳吞掉异常，表现为"什么都不发生"）。
       */
      const readService = <T,>(name: string): T | undefined => {
        try {
          const direct = scope[name]
          if (direct !== undefined && direct !== null) return direct as T
        } catch (error) {
          diagnostics.errors.push('read:' + name + ':' + (error instanceof Error ? error.message : String(error)))
        }
        try {
          const viaGet = typeof scope.get === 'function' ? scope.get(name) : undefined
          if (viaGet !== undefined && viaGet !== null) {
            diagnostics.optionalVia = name
            return viaGet as T
          }
        } catch (error) {
          diagnostics.errors.push('get:' + name + ':' + (error instanceof Error ? error.message : String(error)))
        }
        return undefined
      }
      const slots = readService<{
        inject(name: string, factory: () => unknown): unknown
        register(options: Record<string, unknown>, component: unknown): () => void
      }>('slots')
      if (slots === undefined) {
        report('slots-service-missing')
        return
      }
      diagnostics.slotsShape = typeof slots.inject + '/' + typeof slots.register
      if (typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
        report('slots-service-unusable')
        return
      }
      // 可选：会话当前模型（拿不到就让宿主按会话/默认模型兜底）。
      const models = readService<{ directoryFor(id: string): { store: unknown } }>('modelDirectories')

      /**
       * 组装注册选项。刻意保持最小：不提供自定义 inject face —— 已确认部分外壳
       * 不支持把注入面的 hooks 变成组件 props，那一层会让组件永远不渲染。
       * 组件只用 session 作用域的标准 props（useInput / inputActions）。
       * @param slot - 目标插槽 key。
       * @param id - 该插槽里的条目 id。
       * @returns 注册选项。
       */
      const optionsOf = (slot: string, id: string): Record<string, unknown> => ({
        name: slot,
        id,
        order: 10,
      })

      /* 未替换仓库地址的源码检出（直接跑 src/ 而不是 npm 包）时提示一次。 */
      if (REPO_URL === '') {
        console.info('[prompt-polish] dev build: repository URL was not stamped into the bundle')
      }

      /*
       * 候选插槽按"离模型名有多近"排序：
       *  - conversation.input.right 在模型座席之前渲染（同一个右侧分组），
       *    落在模型名紧邻左侧 —— 首选；
       *  - conversation.input.left 在工具行最左侧（离模型名较远），仅作兜底；
       *  - plan / dock 是更远的兜底。
       * 逐个尝试、成功即止，保证任何时刻只有一个按钮。
       */
      const CANDIDATES: Array<[string, string]> = [
        ['conversation.input.right', 'prompt-polish-right'],
        ['conversation.input.left', 'prompt-polish-left'],
        ['conversation.input.plan', 'prompt-polish-plan'],
        ['conversation.input.dock', 'prompt-polish-dock'],
      ]
      report('candidates:' + CANDIDATES.map(([slot]) => slot).join(','))

      const cleanups: Array<() => void> = []
      let cancelled = false
      let index = 0
      let timer: ReturnType<typeof setTimeout> | undefined

      /**
       * 登记一个候选插槽的 inject 等待：插槽被声明后才会执行回调。
       * @param slot - 候选插槽 key。
       * @param id - 该插槽里的条目 id。
       */
      const arm = (slot: string, id: string): void => {
        const attempt = (): (() => void) => {
          try {
            /*
             * 刻意不做"是否已注册"的全局闸门：一旦那个标记被某次失败/重复求值置位，
             * 后续所有候选都会被跳过，结果是一个按钮都没有（真实踩过）。
             * 重复注册的风险由"一次只注册一个候选 + 失败才换下一个"来规避。
             */
            const disposer = slots.register(optionsOf(slot, id), PolishButton)
            diagnostics.mounted.push(slot)
            diagnostics.registered = true
            if (diagnostics.slot === undefined) diagnostics.slot = slot
            report('registered:' + slot)
            return typeof disposer === 'function' ? disposer : () => {}
          } catch (error) {
            diagnostics.attempts.push(slot + ':fail:' + (error instanceof Error ? error.message : String(error)))
            report('registration-failed:' + slot, error)
            return () => {}
          }
        }
        try {
          const cleanup = slots.inject(slot, attempt)
          if (typeof cleanup === 'function') cleanups.push(cleanup as () => void)
        } catch (error) {
          diagnostics.attempts.push(slot + ':inject-threw:' + (error instanceof Error ? error.message : String(error)))
          report('inject-failed:' + slot, error)
        }
      }

      /**
       * 逐个尝试候选插槽：一个成功就不再尝试下一个。
       * 串行是"只出现一个按钮"的关键——同时注册多个候选会渲染出多个按钮。
       * 若某个版本没有该插槽，`slots.inject` 的回调不会执行，
       * 1.5 秒后自动换下一个候选。
       */
      const tryNext = (): void => {
        if (cancelled || diagnostics.registered) return
        const candidate = CANDIDATES[index]
        index += 1
        if (candidate === undefined) {
          report('no-slot-available')
          return
        }
        arm(candidate[0], candidate[1])
        timer = setTimeout(tryNext, 1500)
      }
      tryNext()

      return () => {
        cancelled = true
        if (timer !== undefined) clearTimeout(timer)
        for (const cleanup of cleanups) {
          try {
            cleanup()
          } catch {
            /* 卸载期清理失败无需上报 */
          }
        }
      }
    } catch (error) {
      report('slots-callback-threw', error)
      return undefined
    }
  })
}