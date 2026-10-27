/**
 * 格式化工具
 * ------------------------------------------------------------------
 * 金额、日期、周期等展示层统一从这里取值。
 */

/** 金额千分位 + 两位小数，不带符号 */
export function formatAmount(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * 按收支类型标注正负号：支出为 "-"，收入为 "+"
 * @param {number} value 绝对金额
 * @param {'expense'|'income'} type
 */
export function formatSignedMoney(value, type) {
  const num = Number(value) || 0;
  const prefix = type === 'income' ? '+' : '-';
  return `${prefix}¥ ${formatAmount(Math.abs(num))}`;
}

/** 紧凑金额：超过 1 万显示为「1.2万」，用于图表标签 */
export function formatCompact(value) {
  const num = Number(value) || 0;
  if (Math.abs(num) >= 10000) {
    return `${(num / 10000).toFixed(1)}万`;
  }
  return formatAmount(num);
}

/** 百分比，保留一位小数 */
export function formatPercent(value, { digits = 1 } = {}) {
  const num = Number(value) || 0;
  return `${num.toFixed(digits)}%`;
}

/**
 * 构造 Date 对象
 * ------------------------------------------------------------------
 * 需要区分两类时间字符串：
 *   1. 「2026-10-24 12:30:00」—— 本地时间，按本地时区解析；
 *   2. 「2026-10-24T12:30:00.000Z」—— ISO 字符串，带时区则交给原生解析。
 * 直接用 new Date('2026-10-24') 会被当作 UTC，导致日期偏移一天。
 */
export function toDate(value) {
  if (value instanceof Date) return value;

  if (typeof value === 'string') {
    // ISO 8601（含 T 分隔符）
    const iso = value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/
    );
    if (iso) {
      const [, y, m, d, hh, mm, ss, tz] = iso;
      if (tz) return new Date(value); // 带时区信息，交给原生解析
      return new Date(+y, +m - 1, +d, +hh, +mm, +(ss || 0));
    }

    // 本地时间字符串
    const local = value.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ ](\d{2}):(\d{2})(?::(\d{2}))?)?/
    );
    if (local) {
      const [, y, m, d, hh = 0, mm = 0, ss = 0] = local;
      return new Date(+y, +m - 1, +d, +hh, +mm, +ss);
    }
  }

  return new Date(value);
}

/** YYYY-MM-DD */
export function dateKey(value) {
  const d = toDate(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM */
export function monthKey(value = new Date()) {
  const d = toDate(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** HH:mm */
export function timeKey(value) {
  const d = toDate(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** YYYY-MM-DD HH:mm */
export function formatDateTime(value) {
  if (!value) return '—';
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** MM月DD日 */
export function formatMonthDay(value) {
  const d = toDate(value);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export function weekday(value) {
  return WEEKDAYS[toDate(value).getDay()];
}

/** 今天 / 昨天 / MM月DD日（PRD FR-03 R2） */
export function formatDayLabel(value, now = new Date()) {
  const d = toDate(value);
  const today = toDate(now);
  const diff = Math.floor(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()) -
      new Date(d.getFullYear(), d.getMonth(), d.getDate())) /
      86400000
  );
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return formatMonthDay(d);
}

/** 2026 年 10 月 */
export function formatMonthLabel(key) {
  const [y, m] = key.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

/** 按月偏移，dir: -1 上个月 / +1 下个月 */
export function shiftMonth(key, dir) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + dir, 1);
  return monthKey(d);
}

/** 环比百分比：(本月 - 上月) / 上月 × 100%，上月为 0 时返回 null */
export function monthOverMonth(current, previous) {
  const prev = Number(previous) || 0;
  if (prev <= 0) return null;
  return ((Number(current) - prev) / prev) * 100;
}
