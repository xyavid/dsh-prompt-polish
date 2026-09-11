/**
 * 组件样式：一次性注入一个 <style> 标签，避免依赖任何 CSS 方案。
 * 只有按钮本体需要的规则：三态（空闲 / 优化中 / 可撤回）+ 失败态。
 * @module dsh-prompt-polish/client/styles
 */
const STYLE_ID = 'dsh-prompt-polish-styles'

const CSS = `
.dsh-pp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsh-text-secondary, #8a8f98);
  cursor: pointer;
  transition: color .15s ease, background-color .15s ease, transform .15s ease;
}
.dsh-pp-btn:hover:not(:disabled) {
  color: var(--dsh-accent, #4d6bfe);
  background: var(--dsh-surface-hover, rgba(127, 127, 127, .12));
}
.dsh-pp-btn:disabled { cursor: default; opacity: .45; }
/* 优化中：点击 = 取消，用危险色提示 */
.dsh-pp-btn.is-busy { color: var(--dsh-accent, #4d6bfe); }
.dsh-pp-btn.is-busy:hover:not(:disabled) {
  color: var(--dsh-danger, #e5484d);
  background: var(--dsh-surface-hover, rgba(127, 127, 127, .12));
}
.dsh-pp-btn.is-busy .dsh-pp-icon { animation: dsh-pp-spin 1.1s linear infinite; }
/* 已完成：按钮变成撤回箭头 */
.dsh-pp-btn.is-revert { color: var(--dsh-accent, #4d6bfe); }
.dsh-pp-btn.is-error { color: var(--dsh-danger, #e5484d); }
.dsh-pp-icon { display: block; }
@keyframes dsh-pp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`

/** 注入样式（幂等）。 */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.append(style)
}
