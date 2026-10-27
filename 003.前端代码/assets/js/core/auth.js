/**
 * 账号与登录态（Auth）
 * ------------------------------------------------------------------
 * 应用没有后端，账号完全保存在本机 localStorage（key = ledger:v1:auth），
 * 与账目数据（ledger:v1）分开存放，互不影响：
 * 「清除全部数据」不会注销账号，删除账目也不会把用户踢下线。
 *
 * 密码只保存「随机盐 + 哈希」，任何时候都读不回明文。
 */

import { AUTH_STORAGE_KEY, AUTH_RULES } from './constants.js';
import { storage } from './storage.js';

/* ------------------------------------------------------------------ *
 * 内部状态
 * ------------------------------------------------------------------ */

const emptyState = () => ({ accounts: [], session: null });

function read() {
  const saved = storage.getItem(AUTH_STORAGE_KEY, null);
  if (!saved || !Array.isArray(saved.accounts)) return emptyState();
  return { accounts: saved.accounts, session: saved.session || null };
}

function write(state) {
  storage.setItem(AUTH_STORAGE_KEY, state);
}

function update(mutator) {
  const state = read();
  const result = mutator(state);
  write(state);
  return result;
}

/* ------------------------------------------------------------------ *
 * 密码哈希
 * ------------------------------------------------------------------ */

/** 生成随机盐（hex） */
function randomSalt() {
  const bytes = new Uint8Array(16);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * 计算密码哈希
 * ------------------------------------------------------------------
 * 优先使用 SubtleCrypto 的 SHA-256（localhost 属于 secure context，可用）；
 * 在非安全上下文（如通过局域网 IP 访问）降级为简易哈希，保证功能不中断。
 */
async function hashPassword(password, salt) {
  const payload = `${salt}:${password}`;

  if (window.crypto && window.crypto.subtle) {
    try {
      const digest = await window.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(payload)
      );
      return toHex(digest);
    } catch {
      /* 落到下面的降级实现 */
    }
  }
  return simpleHash(payload);
}

/** 简易哈希（仅在拿不到 SubtleCrypto 时兜底，强度有限） */
function simpleHash(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
  ).repeat(2);
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

/** 账号格式：4～20 位，支持手机号 / 字母 / 数字 / 下划线 */
function isValidAccount(value) {
  return /^[a-zA-Z0-9_]{4,20}$/.test(value) || /^1[3-9]\d{9}$/.test(value);
}

function isValidPhone(value) {
  return /^1[3-9]\d{9}$/.test(value);
}

/* ------------------------------------------------------------------ *
 * 对外接口
 * ------------------------------------------------------------------ */

export const auth = {
  /** 是否已经注册过账号 */
  isRegistered() {
    return read().accounts.length > 0;
  },

  /** 当前是否有有效登录态 */
  isLoggedIn() {
    const { session } = read();
    if (!session || !session.accountId) return false;
    const expiresAt = Number(session.expiresAt || 0);
    if (expiresAt && Date.now() > expiresAt) {
      this.logout();
      return false;
    }
    return read().accounts.some((a) => a.id === session.accountId);
  },

  /** 当前登录账号（不含密码字段） */
  getAccount() {
    if (!this.isLoggedIn()) return null;
    const { session, accounts } = read();
    const account = accounts.find((a) => a.id === session.accountId);
    if (!account) return null;
    const { passwordHash, salt, ...safe } = account;
    return safe;
  },

  /** 登录态剩余有效期（毫秒），未登录返回 0 */
  getSessionRemain() {
    const { session } = read();
    if (!session) return 0;
    return Math.max(0, Number(session.expiresAt || 0) - Date.now());
  },

  /**
   * 注册账号
   * @param {object} payload
   * @param {string} payload.account   账号或手机号
   * @param {string} payload.nickname  昵称
   * @param {string} payload.password  密码
   * @param {string} [payload.avatar]  头像 emoji
   * @returns {Promise<{ok:boolean, message?:string, account?:object}>}
   */
  async register({ account, nickname, password, avatar }) {
    const acc = String(account || '').trim();
    const nick = String(nickname || '').trim();
    const pwd = String(password || '');

    if (!acc) return { ok: false, message: '请输入账号' };
    if (!isValidAccount(acc)) {
      return { ok: false, message: '账号需为 4～20 位字母数字，或 11 位手机号' };
    }
    if (!nick) return { ok: false, message: '请输入昵称' };
    if (nick.length > AUTH_RULES.MAX_NICKNAME_LENGTH) {
      return { ok: false, message: `昵称不能超过 ${AUTH_RULES.MAX_NICKNAME_LENGTH} 字` };
    }
    if (!pwd) return { ok: false, message: '请输入密码' };
    if (pwd.length < AUTH_RULES.MIN_PASSWORD_LENGTH) {
      return { ok: false, message: `密码至少 ${AUTH_RULES.MIN_PASSWORD_LENGTH} 位` };
    }
    if (pwd.length > AUTH_RULES.MAX_PASSWORD_LENGTH) {
      return { ok: false, message: `密码不能超过 ${AUTH_RULES.MAX_PASSWORD_LENGTH} 位` };
    }

    const exists = read().accounts.some((a) => a.account === acc);
    if (exists) return { ok: false, message: '该账号已被注册' };

    const salt = randomSalt();
    const passwordHash = await hashPassword(pwd, salt);
    const now = new Date().toISOString();
    const record = {
      id: `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      account: acc,
      nickname: nick,
      avatar: avatar || '🙂',
      salt,
      passwordHash,
      createdAt: now,
      lastLoginAt: now,
    };

    update((state) => {
      state.accounts.push(record);
      state.session = {
        accountId: record.id,
        loginAt: now,
        expiresAt: Date.now() + AUTH_RULES.SESSION_DAYS * 86400000,
      };
    });

    const { passwordHash: _p, salt: _s, ...safe } = record;
    return { ok: true, account: safe };
  },

  /**
   * 登录
   * @param {object} payload
   * @param {string} payload.account
   * @param {string} payload.password
   * @returns {Promise<{ok:boolean, message?:string, account?:object}>}
   */
  async login({ account, password }) {
    const acc = String(account || '').trim();
    const pwd = String(password || '');

    if (!acc) return { ok: false, message: '请输入账号' };
    if (!pwd) return { ok: false, message: '请输入密码' };

    const record = read().accounts.find((a) => a.account === acc);
    // 账号不存在与密码错误给不同提示，便于演示，也更贴近真实产品的引导
    if (!record) return { ok: false, message: '该账号尚未注册' };

    const hash = await hashPassword(pwd, record.salt);
    if (hash !== record.passwordHash) {
      return { ok: false, message: '密码不正确' };
    }

    const now = new Date().toISOString();
    update((state) => {
      const target = state.accounts.find((a) => a.id === record.id);
      if (target) target.lastLoginAt = now;
      state.session = {
        accountId: record.id,
        loginAt: now,
        expiresAt: Date.now() + AUTH_RULES.SESSION_DAYS * 86400000,
      };
    });

    const { passwordHash: _p, salt: _s, ...safe } = record;
    return { ok: true, account: safe };
  },

  /** 退出登录（只清会话，不动账号与账目） */
  logout() {
    update((state) => {
      state.session = null;
    });
  },

  /** 更新资料（昵称 / 头像） */
  updateProfile(patch) {
    const account = this.getAccount();
    if (!account) return { ok: false, message: '尚未登录' };

    if (patch.nickname !== undefined) {
      const nick = String(patch.nickname).trim();
      if (!nick) return { ok: false, message: '昵称不能为空' };
      if (nick.length > AUTH_RULES.MAX_NICKNAME_LENGTH) {
        return { ok: false, message: `昵称不能超过 ${AUTH_RULES.MAX_NICKNAME_LENGTH} 字` };
      }
      patch.nickname = nick;
    }

    update((state) => {
      const target = state.accounts.find((a) => a.id === account.id);
      if (target) Object.assign(target, patch);
    });
    return { ok: true, account: this.getAccount() };
  },

  /**
   * 修改密码
   * @param {object} payload
   * @param {string} payload.oldPassword
   * @param {string} payload.newPassword
   */
  async changePassword({ oldPassword, newPassword }) {
    const account = this.getAccount();
    if (!account) return { ok: false, message: '尚未登录' };

    const pwd = String(newPassword || '');
    if (!pwd) return { ok: false, message: '请输入新密码' };
    if (pwd.length < AUTH_RULES.MIN_PASSWORD_LENGTH) {
      return { ok: false, message: `新密码至少 ${AUTH_RULES.MIN_PASSWORD_LENGTH} 位` };
    }
    if (pwd.length > AUTH_RULES.MAX_PASSWORD_LENGTH) {
      return { ok: false, message: `新密码不能超过 ${AUTH_RULES.MAX_PASSWORD_LENGTH} 位` };
    }
    if (pwd === String(oldPassword || '')) {
      return { ok: false, message: '新密码不能与原密码相同' };
    }

    const record = read().accounts.find((a) => a.id === account.id);
    const oldHash = await hashPassword(String(oldPassword || ''), record.salt);
    if (oldHash !== record.passwordHash) {
      return { ok: false, message: '原密码不正确' };
    }

    const salt = randomSalt();
    const passwordHash = await hashPassword(pwd, salt);

    update((state) => {
      const target = state.accounts.find((a) => a.id === account.id);
      if (target) {
        target.salt = salt;
        target.passwordHash = passwordHash;
      }
    });
    return { ok: true };
  },

  /**
   * 门禁：未登录时跳转到登录页
   * @param {string} [redirect] 登录成功后要去的页面
   */
  redirectToLogin(redirect) {
    const target = redirect || window.location.pathname.split('/').pop() || 'home.html';
    const query = target && target !== 'login.html' ? `?redirect=${encodeURIComponent(target)}` : '';
    window.location.replace(`login.html${query}`);
  },
};

export { isValidPhone, isValidAccount };
