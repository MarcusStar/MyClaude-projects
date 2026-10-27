/**
 * localStorage 封装
 * ------------------------------------------------------------------
 * 在 file:// 或隐私模式下 localStorage 可能不可用，
 * 这里统一降级为内存存储，保证页面不报错。
 */

const memoryFallback = new Map();
let available = true;

try {
  const probe = '__ledger_probe__';
  window.localStorage.setItem(probe, '1');
  window.localStorage.removeItem(probe);
} catch {
  available = false;
}

export const storage = {
  get available() {
    return available;
  },

  getItem(key, fallback = null) {
    try {
      const raw = available
        ? window.localStorage.getItem(key)
        : memoryFallback.get(key) ?? null;
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  setItem(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (available) window.localStorage.setItem(key, raw);
      else memoryFallback.set(key, raw);
      return true;
    } catch {
      memoryFallback.set(key, raw);
      return false;
    }
  },

  removeItem(key) {
    try {
      if (available) window.localStorage.removeItem(key);
    } catch {
      /* noop */
    }
    memoryFallback.delete(key);
  },
};
