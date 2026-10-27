/**
 * 全局轻提示（Toast）
 * ------------------------------------------------------------------
 * 单例：同一时刻只显示一条，重复调用会重置计时。
 */

import { h, getOverlayHost } from './dom.js';

let toastEl = null;
let timer = null;

function ensure() {
  if (toastEl && document.body.contains(toastEl)) return toastEl;
  toastEl = h('div.toast', { role: 'status', 'aria-live': 'polite' });
  getOverlayHost().append(toastEl);
  return toastEl;
}

/**
 * @param {string} message 提示文案
 * @param {number} [duration] 停留时长（毫秒）
 */
export function showToast(message, duration = 2000) {
  const el = ensure();
  el.textContent = message;
  // 触发过渡
  requestAnimationFrame(() => el.classList.add('is-open'));
  clearTimeout(timer);
  timer = setTimeout(() => {
    el.classList.remove('is-open');
  }, duration);
}
