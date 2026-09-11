/**
 * 宿主与浏览器半之间的线协议：纯类型与常量，可安全打进两半。
 * @module dsh-prompt-polish/protocol
 */

/** 优化接口路径。 */
export const OPTIMIZE_ENDPOINT = '/api/prompt-polish/optimize'

/** 一次优化请求的请求体。 */
export interface OptimizeRequestBody {
  /** 当前草稿原文。 */
  text: string
  /** 承载该草稿的会话 id（可选，仅用于路由兜底与请求标记）。 */
  sessionId?: string
  /** 会话当前选择的模型路由（可选；缺省时宿主按会话/默认模型兜底）。 */
  selection?: {
    provider: string
    model: string
    reasoningEffort?: string
  }
}

/** 一次成功优化的结果。 */
export interface OptimizeResult {
  /** 优化后的提示词正文（已清洗）。 */
  text: string
  /** 实际使用的 provider。 */
  provider: string
  /** 实际使用的 model。 */
  model: string
  /** 耗时（毫秒）。 */
  elapsedMs: number
}

/** 稳定的失败码，浏览器半据此显示中文文案。 */
export type OptimizeErrorCode =
  | 'rejected'
  | 'timeout'
  | 'aborted'
  | 'unconfigured'
  | 'upstream'
  | 'internal'

/** 结构化失败。 */
export interface OptimizeError {
  code: OptimizeErrorCode
  /** 诊断细节，原样透传（模型/供应商的原始报错等）。 */
  message?: string
}

/** 接口响应信封。 */
export type OptimizeResponse =
  | { ok: true; value: OptimizeResult }
  | { ok: false; error: OptimizeError }
