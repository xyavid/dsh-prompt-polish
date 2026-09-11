/**
 * 极简 HTTP 工具：受限读体 + JSON 响应。
 * @module dsh-prompt-polish/http
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * 读取请求体并解析 JSON，超过上限立即失败。
 * @param req - 请求对象。
 * @param cap - 字节上限。
 * @returns 解析后的 JSON 值。
 * @throws Error('body too large') 或 JSON 解析错误。
 */
export async function readBoundedJson(req: IncomingMessage, cap: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buffer.length
    if (size > cap) {
      req.destroy()
      throw new Error('body too large')
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text === '' ? undefined : JSON.parse(text)
}

/**
 * 写一个 JSON 响应。
 * @param res - 响应对象。
 * @param status - HTTP 状态码。
 * @param body - 响应体。
 */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}
