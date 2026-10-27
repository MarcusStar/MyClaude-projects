/**
 * 数据仓库（Store）
 * ------------------------------------------------------------------
 * 全应用唯一的数据出入口。对外只暴露「读」与「写」的语义化方法，
 * 页面不直接触碰 localStorage，也不在页面里拼装业务规则。
 *
 * 持久化：localStorage（key = ledger:v1），不可用时自动降级为内存存储。
 * 数据一致性：每次写入都会重新持久化并广播变更事件。
 */

import { STORAGE_KEY, RULES, TX_TYPE } from './constants.js';
import { storage } from './storage.js';
import { dateKey, monthKey, toDate } from './format.js';
import {
  SEED_CATEGORIES,
  SEED_TRANSACTIONS,
  SEED_BUDGETS,
  SEED_EXPORT_HISTORY,
  SEED_SETTINGS,
} from '../../data/seed.js';

/* ------------------------------------------------------------------ *
 * 内部状态
 * ------------------------------------------------------------------ */

const state = {
  categories: [],
  transactions: [],
  budgets: [],
  exportHistory: [],
  settings: {},
};

const listeners = new Set();

/** 深拷贝，避免调用方直接改到内部状态 */
const clone = (value) => JSON.parse(JSON.stringify(value));

function persist() {
  storage.setItem(STORAGE_KEY, {
    categories: state.categories,
    transactions: state.transactions,
    budgets: state.budgets,
    exportHistory: state.exportHistory,
    settings: state.settings,
  });
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (err) {
      console.error('[store] listener error', err);
    }
  });
}

/** 写入并广播 */
function commit() {
  persist();
  notify();
}

function load() {
  const saved = storage.getItem(STORAGE_KEY, null);
  if (saved && Array.isArray(saved.categories) && Array.isArray(saved.transactions)) {
    state.categories = saved.categories;
    state.transactions = saved.transactions;
    state.budgets = saved.budgets || [];
    state.exportHistory = saved.exportHistory || [];
    state.settings = { ...SEED_SETTINGS, ...(saved.settings || {}) };
    return;
  }
  // 首次启动：写入种子数据
  state.categories = clone(SEED_CATEGORIES);
  state.transactions = clone(SEED_TRANSACTIONS);
  state.budgets = clone(SEED_BUDGETS);
  state.exportHistory = clone(SEED_EXPORT_HISTORY);
  state.settings = clone(SEED_SETTINGS);
  persist();
}

load();

/* ------------------------------------------------------------------ *
 * 内部工具
 * ------------------------------------------------------------------ */

const uid = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const activeTransactions = () => state.transactions.filter((t) => !t.isDeleted);

/** 找出指定类型的兜底分类（删除自定义分类后流水归入这里） */
const fallbackCategoryId = (type) => {
  const same = state.categories.find((c) => c.type === type && c.name === '其他');
  return same ? same.id : state.categories.find((c) => c.type === type).id;
};

/* ------------------------------------------------------------------ *
 * 分类
 * ------------------------------------------------------------------ */

/**
 * 分类列表
 * @param {'expense'|'income'} [type]     按类型过滤
 * @param {object} [options]
 * @param {boolean} [options.includeHidden] 是否包含已隐藏的分类（分类管理页需要）
 */
const listCategories = (type, options = {}) => {
  const { includeHidden = false } = options;
  return state.categories
    .filter((c) => (type ? c.type === type : true) && (includeHidden || !c.isHidden))
    .sort((a, b) => a.sortOrder - b.sortOrder);
};

const getCategory = (id) => state.categories.find((c) => c.id === id) || null;

/** 同名分类兜底查找（种子数据以名称引用时使用） */
const findCategoryByName = (name, type) =>
  state.categories.find((c) => c.name === name && c.type === type) || null;

/**
 * 新增自定义分类（PRD FR-08）
 */
const addCategory = ({ name, type, icon = '📦', color = '#F1F3F4' }) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { ok: false, message: '请输入分类名称' };
  if (trimmed.length > RULES.MAX_CATEGORY_NAME_LENGTH) {
    return { ok: false, message: `分类名称不能超过 ${RULES.MAX_CATEGORY_NAME_LENGTH} 字` };
  }
  const sameType = state.categories.filter((c) => c.type === type);
  if (sameType.length >= RULES.MAX_CATEGORIES_PER_TYPE) {
    return { ok: false, message: `每种类型最多 ${RULES.MAX_CATEGORIES_PER_TYPE} 个分类` };
  }
  if (sameType.some((c) => c.name === trimmed)) {
    return { ok: false, message: '已存在同名分类' };
  }
  const maxOrder = sameType.reduce((max, c) => Math.max(max, c.sortOrder), -1);
  const category = {
    id: uid('cat'),
    name: trimmed,
    type,
    icon,
    color,
    sortOrder: maxOrder + 1,
    isPreset: false,
    isHidden: false,
  };
  state.categories.push(category);
  commit();
  return { ok: true, category };
};

/**
 * 编辑分类（预设分类可改名 / 隐藏，但不可删除 —— PRD FR-08 R1）
 */
const updateCategory = (id, patch) => {
  const category = getCategory(id);
  if (!category) return { ok: false, message: '分类不存在' };
  if (patch.name !== undefined) {
    const trimmed = String(patch.name).trim();
    if (!trimmed) return { ok: false, message: '请输入分类名称' };
    if (trimmed.length > RULES.MAX_CATEGORY_NAME_LENGTH) {
      return { ok: false, message: `分类名称不能超过 ${RULES.MAX_CATEGORY_NAME_LENGTH} 字` };
    }
    const duplicated = state.categories.some(
      (c) => c.type === category.type && c.name === trimmed && c.id !== id
    );
    if (duplicated) return { ok: false, message: '已存在同名分类' };
    category.name = trimmed;
  }
  if (patch.icon !== undefined) category.icon = patch.icon;
  if (patch.color !== undefined) category.color = patch.color;
  if (patch.isHidden !== undefined) category.isHidden = patch.isHidden;
  commit();
  return { ok: true, category };
};

/**
 * 删除分类：预设分类不可删除；自定义分类下若有流水，流水归入「其他」
 * 返回受影响流水数量，供前端弹窗提示（PRD FR-08 R2）
 */
const checkCategoryDeletable = (id) => {
  const category = getCategory(id);
  if (!category) return { ok: false, reason: 'not-found', affected: 0 };
  if (category.isPreset) return { ok: false, reason: 'preset', affected: 0 };
  const affected = activeTransactions().filter((t) => t.categoryId === id).length;
  return { ok: true, reason: 'custom', affected };
};

const deleteCategory = (id) => {
  const check = checkCategoryDeletable(id);
  if (!check.ok) return { ok: false, message: '预设分类不可删除' };
  const target = getCategory(id);
  const fallback = fallbackCategoryId(target.type);
  state.transactions.forEach((t) => {
    if (t.categoryId === id) {
      t.categoryId = fallback;
      t.updatedAt = new Date().toISOString();
    }
  });
  state.categories = state.categories.filter((c) => c.id !== id);
  commit();
  return { ok: true, affected: check.affected };
};

/** 按给定的 id 顺序重排分类 */
const reorderCategories = (type, orderedIds) => {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  state.categories
    .filter((c) => c.type === type)
    .forEach((c) => {
      if (rank.has(c.id)) c.sortOrder = rank.get(c.id);
    });
  commit();
};

/* ------------------------------------------------------------------ *
 * 流水
 * ------------------------------------------------------------------ */

/**
 * 查询流水
 * @param {object} filters
 * @param {'all'|'expense'|'income'} [filters.type]
 * @param {string[]} [filters.categoryIds]
 * @param {string} [filters.keyword]      匹配备注与分类名
 * @param {string} [filters.month]        YYYY-MM
 * @param {string} [filters.from]         YYYY-MM-DD
 * @param {string} [filters.to]           YYYY-MM-DD
 */
const listTransactions = (filters = {}) => {
  const { type = 'all', categoryIds = [], keyword = '', month, from, to } = filters;
  let result = activeTransactions();

  if (type !== 'all') result = result.filter((t) => t.type === type);
  if (categoryIds.length) result = result.filter((t) => categoryIds.includes(t.categoryId));
  if (month) result = result.filter((t) => monthKey(t.occurredAt) === month);
  if (from) result = result.filter((t) => dateKey(t.occurredAt) >= from);
  if (to) result = result.filter((t) => dateKey(t.occurredAt) <= to);

  if (keyword) {
    const kw = keyword.trim().toLowerCase();
    result = result.filter((t) => {
      const category = getCategory(t.categoryId);
      return (
        String(t.note || '').toLowerCase().includes(kw) ||
        String(category ? category.name : '').toLowerCase().includes(kw)
      );
    });
  }

  return result
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((t) => ({ ...t, category: getCategory(t.categoryId) }));
};

const getTransaction = (id) => {
  const tx = activeTransactions().find((t) => t.id === id);
  return tx ? { ...tx, category: getCategory(tx.categoryId) } : null;
};

/** 校验记账表单（PRD FR-01 业务规则） */
const validateTransaction = (draft) => {
  const errors = {};
  const amount = Number(draft.amount);

  if (!draft.categoryId) errors.categoryId = '请选择分类';
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = '请输入金额';
  else if (amount > RULES.MAX_AMOUNT) errors.amount = '金额超出上限';

  const note = String(draft.note || '');
  if (note.length > RULES.MAX_NOTE_LENGTH) errors.note = `备注不能超过 ${RULES.MAX_NOTE_LENGTH} 字`;

  if (draft.occurredAt) {
    const occurred = toDate(draft.occurredAt);
    const now = new Date();
    const earliest = new Date(now.getFullYear() - RULES.DATE_RANGE_YEARS, now.getMonth(), now.getDate());
    if (occurred > now) errors.occurredAt = '不能记录未来的账';
    else if (occurred < earliest) errors.occurredAt = '仅支持最近 5 年内的账目';
  }

  return { valid: Object.keys(errors).length === 0, errors };
};

/**
 * 新增流水
 */
const createTransaction = (draft) => {
  const check = validateTransaction(draft);
  if (!check.valid) return { ok: false, errors: check.errors };

  const now = new Date().toISOString();
  const tx = {
    id: uid('tx'),
    type: draft.type === TX_TYPE.INCOME ? TX_TYPE.INCOME : TX_TYPE.EXPENSE,
    amount: Math.round(Number(draft.amount) * 100) / 100,
    categoryId: draft.categoryId,
    note: String(draft.note || '').trim(),
    occurredAt: draft.occurredAt || now.slice(0, 19).replace('T', ' '),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  };
  state.transactions.push(tx);

  // 记住上次使用的分类（PRD FR-01 R3）
  state.settings.lastCategory = {
    ...state.settings.lastCategory,
    [tx.type]: tx.categoryId,
  };

  commit();
  return { ok: true, transaction: { ...tx, category: getCategory(tx.categoryId) } };
};

/** 更新流水（PRD FR-05） */
const updateTransaction = (id, patch) => {
  const tx = state.transactions.find((t) => t.id === id && !t.isDeleted);
  if (!tx) return { ok: false, errors: { id: '流水不存在' } };

  const merged = { ...tx, ...patch };
  const check = validateTransaction(merged);
  if (!check.valid) return { ok: false, errors: check.errors };

  Object.assign(tx, {
    type: merged.type,
    amount: Math.round(Number(merged.amount) * 100) / 100,
    categoryId: merged.categoryId,
    note: String(merged.note || '').trim(),
    occurredAt: merged.occurredAt,
    updatedAt: new Date().toISOString(),
  });

  state.settings.lastCategory = {
    ...state.settings.lastCategory,
    [tx.type]: tx.categoryId,
  };

  commit();
  return { ok: true, transaction: { ...tx, category: getCategory(tx.categoryId) } };
};

/** 软删除流水（PRD FR-03 R1） */
const deleteTransaction = (id) => {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return { ok: false };
  tx.isDeleted = true;
  tx.updatedAt = new Date().toISOString();
  commit();
  return { ok: true };
};

/** 按日分组，供流水列表使用 */
const groupTransactionsByDay = (transactions) => {
  const groups = new Map();
  transactions.forEach((t) => {
    const key = dateKey(t.occurredAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  return Array.from(groups.entries()).map(([key, items]) => {
    const expense = items
      .filter((t) => t.type === TX_TYPE.EXPENSE)
      .reduce((sum, t) => sum + t.amount, 0);
    const income = items
      .filter((t) => t.type === TX_TYPE.INCOME)
      .reduce((sum, t) => sum + t.amount, 0);
    return { dateKey: key, date: toDate(items[0].occurredAt), items, expense, income };
  });
};

/* ------------------------------------------------------------------ *
 * 预算（PRD FR-07）
 * ------------------------------------------------------------------ */

const getBudget = (mk = monthKey()) => {
  const budget = state.budgets.find((b) => b.month === mk) || null;
  if (!budget) return null;
  const spent = listTransactions({ month: mk, type: TX_TYPE.EXPENSE }).reduce(
    (sum, t) => sum + t.amount,
    0
  );
  const remain = Math.max(0, budget.amount - spent);
  const percent = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
  let level = 'safe';
  if (percent > 90) level = 'danger';
  else if (percent >= 70) level = 'warn';
  return {
    ...budget,
    spent,
    remain: budget.amount - spent,
    remainClamped: remain,
    percent,
    level,
    daysLeft: daysLeftInMonth(mk),
  };
};

const setBudget = (mk, amount) => {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(value) || value <= 0) return { ok: false, message: '请输入有效金额' };
  const existing = state.budgets.find((b) => b.month === mk);
  if (existing) {
    existing.amount = value;
    existing.notified80 = false;
    existing.notified100 = false;
  } else {
    state.budgets.push({
      id: uid('budget'),
      month: mk,
      amount: value,
      notified80: false,
      notified100: false,
    });
  }
  commit();
  return { ok: true };
};

const removeBudget = (mk) => {
  state.budgets = state.budgets.filter((b) => b.month !== mk);
  commit();
};

/** 当月剩余天数 */
function daysLeftInMonth(mk) {
  const [y, m] = mk.split('-').map(Number);
  const total = new Date(y, m, 0).getDate();
  const now = new Date();
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
  if (!isCurrentMonth) return 0;
  return Math.max(0, total - now.getDate());
}

/* ------------------------------------------------------------------ *
 * 统计（PRD FR-06）
 * ------------------------------------------------------------------ */

/** 收支总览 */
const summary = (mk = monthKey()) => {
  const list = listTransactions({ month: mk });
  const expense = list
    .filter((t) => t.type === TX_TYPE.EXPENSE)
    .reduce((sum, t) => sum + t.amount, 0);
  const income = list
    .filter((t) => t.type === TX_TYPE.INCOME)
    .reduce((sum, t) => sum + t.amount, 0);
  const days = new Set(list.map((t) => dateKey(t.occurredAt))).size;
  return {
    month: mk,
    expense,
    income,
    balance: income - expense,
    count: list.length,
    days,
    averagePerDay: days ? expense / days : 0,
  };
};

/** 分类占比，按金额降序 */
const categoryStats = (mk = monthKey(), type = TX_TYPE.EXPENSE) => {
  const list = listTransactions({ month: mk, type });
  const total = list.reduce((sum, t) => sum + t.amount, 0);
  const buckets = new Map();

  list.forEach((t) => {
    if (!buckets.has(t.categoryId)) {
      const category = getCategory(t.categoryId);
      buckets.set(t.categoryId, {
        id: t.categoryId,
        name: category ? category.name : '未分类',
        icon: category ? category.icon : '📦',
        color: category ? category.color : '#F1F3F4',
        amount: 0,
        count: 0,
      });
    }
    const bucket = buckets.get(t.categoryId);
    bucket.amount += t.amount;
    bucket.count += 1;
  });

  return Array.from(buckets.values())
    .map((b) => ({
      ...b,
      percent: total > 0 ? (b.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
};

/** 每日支出趋势 */
const dailyStats = (mk = monthKey(), type = TX_TYPE.EXPENSE) => {
  const [y, m] = mk.split('-').map(Number);
  const total = new Date(y, m, 0).getDate();
  const list = listTransactions({ month: mk, type });
  const buckets = new Map();

  for (let day = 1; day <= total; day += 1) {
    buckets.set(`${mk}-${String(day).padStart(2, '0')}`, { amount: 0, count: 0 });
  }
  list.forEach((t) => {
    const key = dateKey(t.occurredAt);
    if (!buckets.has(key)) return;
    const bucket = buckets.get(key);
    bucket.amount += t.amount;
    bucket.count += 1;
  });

  return Array.from(buckets.entries()).map(([key, value]) => ({
    dateKey: key,
    day: Number(key.slice(-2)),
    label: `${Number(key.slice(5, 7))}/${Number(key.slice(-2))}`,
    amount: value.amount,
    count: value.count,
  }));
};

/** 环比（PRD FR-06 R4） */
const monthOverMonth = (mk = monthKey()) => {
  const [y, m] = mk.split('-').map(Number);
  const prevKey = monthKey(new Date(y, m - 2, 1));
  const current = summary(mk);
  const previous = summary(prevKey);
  const percent = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null);
  return {
    previousMonth: prevKey,
    expenseMoM: percent(current.expense, previous.expense),
    incomeMoM: percent(current.income, previous.income),
    previous,
  };
};

/* ------------------------------------------------------------------ *
 * 导出记录（PRD FR-09）
 * ------------------------------------------------------------------ */

const listExportHistory = () => state.exportHistory.slice();

const addExportHistory = (record) => {
  const item = {
    id: uid('exp'),
    exportedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    ...record,
  };
  state.exportHistory.unshift(item);
  commit();
  return item;
};

const removeExportHistory = (id) => {
  state.exportHistory = state.exportHistory.filter((r) => r.id !== id);
  commit();
};

const clearExportHistory = () => {
  state.exportHistory = [];
  commit();
};

/* ------------------------------------------------------------------ *
 * 设置
 * ------------------------------------------------------------------ */

const getSettings = () => ({ ...state.settings });

const updateSettings = (patch) => {
  state.settings = { ...state.settings, ...patch };
  commit();
  return getSettings();
};

/**
 * 一键清空全部数据（PRD 五：数据安全「支持一键注销并清除全部数据」）
 * ------------------------------------------------------------------
 * 清空的是**用户数据**：所有流水、预算、导出记录、自定义分类与设置项。
 * 预设分类属于应用出厂配置，予以保留，否则清空后用户将无法再记一笔账。
 */
const wipeAll = () => {
  state.transactions = [];
  state.budgets = [];
  state.exportHistory = [];
  state.categories = state.categories.filter((c) => c.isPreset);
  state.settings = clone(SEED_SETTINGS);
  commit();
};

/** 恢复演示用的种子数据（分类 / 流水 / 预算 / 导出记录） */
const resetData = () => {
  state.categories = clone(SEED_CATEGORIES);
  state.transactions = clone(SEED_TRANSACTIONS);
  state.budgets = clone(SEED_BUDGETS);
  state.exportHistory = clone(SEED_EXPORT_HISTORY);
  commit();
};

/** 订阅数据变更 */
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/* ------------------------------------------------------------------ *
 * 导出
 * ------------------------------------------------------------------ */

export const store = {
  // 分类
  listCategories,
  getCategory,
  findCategoryByName,
  addCategory,
  updateCategory,
  deleteCategory,
  checkCategoryDeletable,
  reorderCategories,

  // 流水
  listTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  groupTransactionsByDay,
  validateTransaction,

  // 预算
  getBudget,
  setBudget,
  removeBudget,
  daysLeftInMonth,

  // 统计
  summary,
  categoryStats,
  dailyStats,
  monthOverMonth,

  // 导出
  listExportHistory,
  addExportHistory,
  removeExportHistory,
  clearExportHistory,

  // 设置
  getSettings,
  updateSettings,
  wipeAll,
  resetData,

  // 订阅
  subscribe,
};
