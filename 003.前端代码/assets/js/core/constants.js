/**
 * 全局常量
 * ------------------------------------------------------------------
 * 路由表是唯一的页面跳转来源，禁止在业务代码中散落硬编码路径。
 */

/** 页面路由（相对 pages/ 目录） */
export const ROUTES = {
  login: 'login.html',
  home: 'home.html',
  transactionDetail: 'transaction-detail.html',
  statistics: 'statistics.html',
  categoryDetail: 'category-detail.html',
  budget: 'budget.html',
  categories: 'categories.html',
  search: 'search.html',
  settings: 'settings.html',
  exportData: 'export.html',
  exportHistory: 'export-history.html',
  reminder: 'reminder.html',
};

/** 底部导航 Tab 配置（PRD 7.1：明细 / 统计 / 设置 + 悬浮记账按钮） */
export const TABS = [
  { key: 'home', label: '明细', icon: 'ph:receipt-duotone', href: ROUTES.home },
  { key: 'statistics', label: '统计', icon: 'ph:chart-donut', href: ROUTES.statistics },
  { key: 'settings', label: '设置', icon: 'ph:gear-six', href: ROUTES.settings },
];

/** 流水类型 */
export const TX_TYPE = {
  EXPENSE: 'expense',
  INCOME: 'income',
};

/** 业务规则常量（见 PRD 4.3） */
export const RULES = {
  MAX_AMOUNT: 9999999.99,
  MAX_NOTE_LENGTH: 50,
  MAX_CATEGORY_NAME_LENGTH: 6,
  MAX_CATEGORIES_PER_TYPE: 30,
  PAGE_SIZE: 30,
  DATE_RANGE_YEARS: 5,
  BUDGET_ALERT_THRESHOLDS: [80, 100],
};

/** localStorage 键名 */
export const STORAGE_KEY = 'ledger:v1';
export const AUTH_STORAGE_KEY = 'ledger:v1:auth';

/** 账号相关规则 */
export const AUTH_RULES = {
  MIN_PASSWORD_LENGTH: 6,
  MAX_PASSWORD_LENGTH: 32,
  MAX_ACCOUNT_LENGTH: 20,
  MAX_NICKNAME_LENGTH: 12,
  /** 登录态有效期（天） */
  SESSION_DAYS: 30,
};
