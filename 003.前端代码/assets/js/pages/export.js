/**
 * 页面：数据导出 —— PRD P-10 / FR-09
 * ------------------------------------------------------------------
 * 选择导出时间范围与内容 → 预览真实 CSV → 下载文件并写入导出记录。
 * PRD FR-09 R1：可选择导出时间范围；
 *            R2：CSV 字段固定为 日期/时间/类型/分类/金额/备注；
 *            R3：导出成功后提供「分享 / 保存至文件」入口。
 */

import { h, icon, clear } from '../core/dom.js';
import { createPage } from '../components/shell.js';
import { createOverlay } from '../components/dialog.js';
import { showToast } from '../core/toast.js';
import { store } from '../core/store.js';
import { ROUTES, TX_TYPE } from '../core/constants.js';
import { formatAmount, dateKey, monthKey, toDate } from '../core/format.js';

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** CSV 表头（PRD FR-09 R2 规定的 6 个字段） */
const CSV_HEADER = '日期,时间,类型,分类,金额,备注';

/** CSV 字段说明表：字段名 + 示例 */
const CSV_FIELDS = [
  { name: '日期', sample: '2026-10-24' },
  { name: '时间', sample: '12:20:00' },
  { name: '类型', sample: '支出 / 收入' },
  { name: '分类', sample: '餐饮' },
  { name: '金额', sample: '38.00（元，两位小数）' },
  { name: '备注', sample: '公司楼下的牛腩饭' },
];

/** UTF-8 BOM（U+FEFF），保证 Excel 打开中文不乱码 */
const BOM = '\uFEFF';

/* ------------------------------------------------------------------ *
 * 页面状态
 * ------------------------------------------------------------------ */

const state = {
  rangeKey: 'month',
  customFrom: null,
  customTo: null,
  includeExpense: true,
  includeIncome: true,
  onlyNote: false,
  /** 最近一次导出的文件信息，供分享面板使用 */
  lastExport: null,
  /** 最近一次导出的 Blob URL（供系统分享面板使用） */
  lastUrl: '',
};

/* ------------------------------------------------------------------ *
 * 通用小工具
 * ------------------------------------------------------------------ */

const pad2 = (n) => String(n).padStart(2, '0');

/** HH:mm:ss */
function timeOfDay(value) {
  const d = toDate(value);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** CSV 单元格转义：含逗号/引号/换行时用双引号包裹 */
function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** 字节数转可读体积 */
function formatSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** 小节标题 */
function sectionTitle(text) {
  return h('h2', {
    style: {
      fontSize: '12px',
      fontWeight: '600',
      color: 'var(--c-ink)',
      paddingLeft: '4px',
      marginBottom: '8px',
    },
  }, text);
}

/* ------------------------------------------------------------------ *
 * 时间范围
 * ------------------------------------------------------------------ */

/** 依据「今天」推导各预设范围 */
function buildRanges() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = dateKey(now);
  const monthStart = `${monthKey(now)}-01`;
  const lastMonthStart = `${monthKey(new Date(y, m - 1, 1))}-01`;
  const lastMonthEnd = dateKey(new Date(y, m, 0));
  const threeStart = `${monthKey(new Date(y, m - 2, 1))}-01`;
  const yearStart = `${y}-01-01`;

  return {
    month: {
      key: 'month', name: '本月', chip: `本月（${m + 1}月）`,
      from: monthStart, to: today, span: `${monthStart} 至 ${today}`,
    },
    lastMonth: {
      key: 'lastMonth', name: '上月', chip: '上月',
      from: lastMonthStart, to: lastMonthEnd, span: `${lastMonthStart} 至 ${lastMonthEnd}`,
    },
    last3: {
      key: 'last3', name: '近 3 个月', chip: '近 3 个月',
      from: threeStart, to: today, span: `${threeStart} 至 ${today}`,
    },
    year: {
      key: 'year', name: '今年', chip: '今年',
      from: yearStart, to: today, span: `${yearStart} 至 ${today}`,
    },
    all: {
      key: 'all', name: '全部数据', chip: '全部数据',
      from: null, to: null, span: '全部历史数据',
    },
    custom: {
      key: 'custom', name: '自定义', chip: '自定义',
      from: null, to: null, span: '自定义区间',
    },
  };
}

/** 当前生效的范围 */
function currentRange() {
  const ranges = buildRanges();
  const range = ranges[state.rangeKey] || ranges.month;
  if (range.key !== 'custom') return range;
  const from = state.customFrom || ranges.last3.from;
  const to = state.customTo || ranges.month.to;
  return { ...range, from, to, span: `${from} 至 ${to}` };
}

/** 范围内的全部流水 */
function rangeTransactions() {
  const { from, to } = currentRange();
  return store.listTransactions({ from: from || undefined, to: to || undefined });
}

/** 按「包含内容」开关过滤后的流水（即最终导出内容） */
function selectedTransactions() {
  let list = rangeTransactions();
  if (!state.includeExpense) list = list.filter((t) => t.type !== TX_TYPE.EXPENSE);
  if (!state.includeIncome) list = list.filter((t) => t.type !== TX_TYPE.INCOME);
  if (state.onlyNote) list = list.filter((t) => String(t.note || '').trim() !== '');
  return list;
}

/* ------------------------------------------------------------------ *
 * CSV 生成
 * ------------------------------------------------------------------ */

/** 单条流水 → CSV 行 */
function toCsvRow(tx) {
  return [
    dateKey(tx.occurredAt),
    timeOfDay(tx.occurredAt),
    tx.type === TX_TYPE.INCOME ? '收入' : '支出',
    csvCell(tx.category ? tx.category.name : '未分类'),
    formatAmount(tx.amount),
    csvCell(tx.note || ''),
  ].join(',');
}

/** 生成完整 CSV 文本 */
function buildCsv(list) {
  return [CSV_HEADER, ...list.map(toCsvRow)].join('\r\n');
}

/** 导出文件名：随手记账_YYYY-MM.csv */
function exportFileName() {
  const { to } = currentRange();
  return `随手记账_${monthKey(to ? toDate(to) : new Date())}.csv`;
}

/** 触发浏览器下载 */
function downloadCsv(text, fileName) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: fileName, style: { display: 'none' } });
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (state.lastUrl) URL.revokeObjectURL(state.lastUrl);
  state.lastUrl = url;
  return { size: blob.size, url };
}

/* ------------------------------------------------------------------ *
 * 页面区块
 * ------------------------------------------------------------------ */

/** 说明卡 */
function buildIntroCard() {
  return h('section.card', {
    style: { padding: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' },
  }, [
    h('div', {
      style: {
        width: '40px', height: '40px', borderRadius: '13px',
        background: 'var(--c-brand-soft)', color: 'var(--c-brand)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '20px', flexShrink: 0,
      },
    }, icon('ph:file-csv')),
    h('div', { style: { flex: '1', minWidth: 0 } }, [
      h('p', { style: { fontSize: '13px', fontWeight: '500' } }, '导出为 CSV 表格'),
      h('p', {
        style: { fontSize: '10.5px', color: 'var(--c-muted)', marginTop: '4px', lineHeight: '1.6' },
      }, '可用 Excel、Numbers、WPS 打开；每行一笔流水，UTF-8 编码，含完整字段与中文表头。'),
    ]),
  ]);
}

/** 时间范围 */
function buildRangeSection(list) {
  const ranges = buildRanges();
  const range = currentRange();

  const chips = Object.values(ranges).map((item) => h('button.chip', {
    type: 'button',
    class: item.key === state.rangeKey ? 'is-active' : '',
    style: { height: '28px', fontSize: '11.5px', padding: '0 12px' },
    dataset: { range: item.key },
    onclick: () => {
      state.rangeKey = item.key;
      render();
    },
  }, item.chip));

  // 自定义区间：开始 / 结束日期
  const customWrap = h('div', {
    class: state.rangeKey === 'custom' ? 'row gap-2' : 'row gap-2 hidden',
    style: { marginTop: '8px' },
  }, [
    h('label', {
      style: {
        flex: '1', background: 'var(--c-surface)', border: '1px solid var(--c-line)',
        borderRadius: '12px', padding: '8px 12px', display: 'block',
      },
    }, [
      h('span', { style: { fontSize: '9.5px', color: 'var(--c-muted)' } }, '开始日期'),
      h('input', {
        type: 'date',
        value: range.from || '',
        style: {
          display: 'block', width: '100%', background: 'transparent',
          border: 'none', outline: 'none', fontSize: '12px', marginTop: '2px',
        },
        onchange: (e) => {
          state.customFrom = e.target.value;
          render();
        },
      }),
    ]),
    h('label', {
      style: {
        flex: '1', background: 'var(--c-surface)', border: '1px solid var(--c-line)',
        borderRadius: '12px', padding: '8px 12px', display: 'block',
      },
    }, [
      h('span', { style: { fontSize: '9.5px', color: 'var(--c-muted)' } }, '结束日期'),
      h('input', {
        type: 'date',
        value: range.to || '',
        style: {
          display: 'block', width: '100%', background: 'transparent',
          border: 'none', outline: 'none', fontSize: '12px', marginTop: '2px',
        },
        onchange: (e) => {
          state.customTo = e.target.value;
          render();
        },
      }),
    ]),
  ]);

  const info = h('div.row.gap-1', {
    style: { marginTop: '8px', paddingLeft: '4px', alignItems: 'center' },
  }, [
    icon('ph:info', 'text-[12px]'),
    h('p', { style: { fontSize: '10px', color: 'var(--c-muted)' } }, [
      '当前范围：',
      h('span', { style: { color: 'var(--c-ink-soft)' } }, range.span),
      ' · 预计 ',
      h('span.num', { style: { color: 'var(--c-brand)' } }, String(list.length)),
      ' 笔',
    ]),
  ]);

  return h('section', { style: { marginTop: '16px' } }, [
    sectionTitle('选择时间范围'),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, chips),
    customWrap,
    info,
  ]);
}

/** 包含内容（支出 / 收入 / 仅备注） */
function buildIncludeSection() {
  const all = rangeTransactions();
  const stat = (type) => {
    const items = all.filter((t) => t.type === type);
    const sum = items.reduce((acc, t) => acc + t.amount, 0);
    return { count: items.length, sum };
  };
  const expense = stat(TX_TYPE.EXPENSE);
  const income = stat(TX_TYPE.INCOME);

  const rows = [
    {
      title: '支出流水',
      desc: `${expense.count} 笔 · 合计 ¥${formatAmount(expense.sum)}`,
      value: state.includeExpense,
      onToggle: () => { state.includeExpense = !state.includeExpense; render(); },
      label: '包含支出',
    },
    {
      title: '收入流水',
      desc: `${income.count} 笔 · 合计 ¥${formatAmount(income.sum)}`,
      value: state.includeIncome,
      onToggle: () => { state.includeIncome = !state.includeIncome; render(); },
      label: '包含收入',
    },
    {
      title: '仅导出备注非空的流水',
      desc: '过滤掉未填写备注的记录',
      value: state.onlyNote,
      onToggle: () => { state.onlyNote = !state.onlyNote; render(); },
      label: '仅导出有备注',
    },
  ];

  return h('section', { style: { marginTop: '16px' } }, [
    sectionTitle('包含内容'),
    h('div.card', { style: { overflow: 'hidden' } },
      rows.map((row, index) => h('div.setting-item', {
        style: index < rows.length - 1 ? { borderBottom: '1px solid var(--c-line-soft)' } : {},
      }, [
        h('div', { style: { flex: '1', minWidth: 0 } }, [
          h('p', { style: { fontSize: '12.5px' } }, row.title),
          h('p', { style: { fontSize: '10px', color: 'var(--c-muted)', marginTop: '2px' } }, row.desc),
        ]),
        buildSwitch(row.value, row.onToggle, row.label),
      ]))),
  ]);
}

/** 开关（PRD FR-09 / FR-10 通用） */
function buildSwitch(on, onToggle, label) {
  return h('button.switch', {
    type: 'button',
    class: on ? 'is-on' : '',
    'aria-label': label,
    'aria-pressed': on ? 'true' : 'false',
    onclick: onToggle,
  }, h('span.switch__knob'));
}

/** CSV 字段说明 */
function buildFieldsSection() {
  const grid = { display: 'grid', gridTemplateColumns: '80px 1fr', alignItems: 'center' };

  return h('section', { style: { marginTop: '16px' } }, [
    h('div.row-between', { style: { padding: '0 4px', marginBottom: '8px' } }, [
      h('h2', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--c-ink)' } }, 'CSV 字段说明'),
      h('span', { style: { fontSize: '10px', color: 'var(--c-muted)' } }, `共 ${CSV_FIELDS.length} 列`),
    ]),
    h('div.card', { style: { overflow: 'hidden' } }, [
      h('div', {
        style: { ...grid, fontSize: '10px', color: 'var(--c-muted)', background: 'var(--c-brand-softer)', padding: '8px 16px' },
      }, [h('span', {}, '字段名'), h('span', {}, '说明 / 示例')]),
      ...CSV_FIELDS.map((field) => h('div', {
        style: {
          ...grid, fontSize: '11px', padding: '10px 16px',
          borderTop: '1px solid var(--c-line-soft)',
        },
      }, [
        h('span', { style: { color: 'var(--c-ink-soft)' } }, field.name),
        h('span.num', { style: { color: 'var(--c-muted)' } }, field.sample),
      ])),
    ]),
    h('p', {
      style: { fontSize: '10px', color: 'var(--c-faint)', marginTop: '8px', paddingLeft: '4px', lineHeight: '1.6' },
    }, '金额以正数保存，通过「类型」列区分收支；备注中的逗号与换行会自动转义，不会错列。'),
  ]);
}

/** 导出预览（真实 CSV 文本样例） */
function buildPreviewSection(list) {
  const lines = [CSV_HEADER, ...list.slice(0, 3).map(toCsvRow)];
  if (list.length > 3) lines.push('...');
  if (!list.length) lines.push('（当前范围没有可导出的流水）');

  return h('section', { style: { marginTop: '16px' } }, [
    sectionTitle('导出预览'),
    h('div', {
      style: {
        background: 'var(--c-ink)', borderRadius: '14px',
        padding: '12px', overflowX: 'auto',
      },
    }, h('pre.num', {
      style: {
        margin: '0', fontSize: '9px', lineHeight: '1.7',
        color: 'var(--c-brand-tint)', whiteSpace: 'pre',
      },
    }, lines.join('\n'))),
  ]);
}

/** 安全提示 */
function buildSecurityTip() {
  return h('div', {
    style: {
      marginTop: '12px', borderRadius: '14px', padding: '10px 14px',
      display: 'flex', alignItems: 'flex-start', gap: '8px',
      background: 'color-mix(in srgb, var(--c-warn) 10%, var(--c-surface))',
      border: '1px solid color-mix(in srgb, var(--c-warn) 30%, var(--c-surface))',
    },
  }, [
    icon('ph:shield-check', 'text-[13px]'),
    h('p', {
      style: { fontSize: '10px', color: 'var(--c-warn)', lineHeight: '1.6' },
    }, '导出文件仅保存在本机，分享时请确认接收方可信。文件包含你的消费明细，请妥善保管。'),
  ]);
}

/* ------------------------------------------------------------------ *
 * 底��操作栏
 * ------------------------------------------------------------------ */

let sizeRef = null;

function buildFooter() {
  sizeRef = h('span.num', {}, '0 KB');

  const primary = h('button.btn.btn--primary', {
    type: 'button',
    style: { flex: '1' },
    onclick: () => performExport(true),
  }, [icon('ph:export', 'text-[15px]'), '导出并分享']);

  const secondary = h('button.btn.btn--ghost', {
    type: 'button',
    'aria-label': '仅保存到本机',
    style: { width: '52px', padding: '0' },
    onclick: () => performExport(false),
  }, icon('ph:download-simple', 'text-[17px]'));

  return h('div', {
    style: {
      flexShrink: 0, background: 'var(--c-surface)',
      borderTop: '1px solid var(--c-line)', padding: '12px 20px',
    },
  }, [
    h('div.row-between', { style: { marginBottom: '8px' } }, [
      h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)' } }, ['文件大小约 ', sizeRef]),
      h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)' } }, [
        '格式：', h('span', { style: { color: 'var(--c-ink-soft)' } }, 'CSV · UTF-8'),
      ]),
    ]),
    h('div.row.gap-2', {}, [primary, secondary]),
    h('a', {
      href: ROUTES.exportHistory,
      style: {
        display: 'block', textAlign: 'center', fontSize: '10px',
        color: 'var(--c-muted)', marginTop: '6px',
      },
    }, '查看历史导出记录'),
  ]);
}

/* ------------------------------------------------------------------ *
 * 导出动作
 * ------------------------------------------------------------------ */

/**
 * 执行导出：生成 CSV → 下载 → 记录历史 → 提示（PRD FR-09 R3）
 * @param {boolean} share 是否弹出分享面板
 */
function performExport(share) {
  const list = selectedTransactions();
  if (!list.length) {
    showToast('当前范围没有可导出的流水');
    return;
  }

  const fileName = exportFileName();
  const { size, url } = downloadCsv(BOM + buildCsv(list), fileName);
  const sizeText = formatSize(size);

  store.addExportHistory({
    range: currentRange().name,
    rangeDetail: currentRange().span,
    fileName,
    rows: list.length,
    size: sizeText,
  });

  state.lastExport = { fileName, rows: list.length, size: sizeText, url };

  showToast(share ? '导出成功' : '已保存到本机');
  if (share) openShareSheet();
}

/* ------------------------------------------------------------------ *
 * 分享面板（PRD FR-09 R3）
 * ------------------------------------------------------------------ */

function buildShareContent(close) {
  const info = state.lastExport || { fileName: '—', rows: 0, size: '0 KB' };

  const channel = (label, iconName, color, bg) => h('button', {
    type: 'button',
    style: { padding: '8px 0', borderRadius: '12px' },
    onclick: () => shareTo(label),
  }, [
    h('span', {
      style: {
        width: '40px', height: '40px', borderRadius: '999px', background: bg, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '19px',
      },
    }, icon(iconName)),
    h('span', { style: { fontSize: '10px', color: 'var(--c-ink-soft)' } }, label),
  ]);

  return h('div', { style: { padding: '0 0 4px' } }, [
    h('div.row-between', {}, [
      h('h2', { style: { fontSize: '15px', fontWeight: '600' } }, '分享导出文件'),
      h('button', {
        type: 'button',
        style: {
          width: '32px', height: '32px', borderRadius: '999px',
          background: 'var(--c-bg)', color: 'var(--c-ink-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
        },
        onclick: close,
      }, icon('ph:x')),
    ]),
    h('div', {
      style: {
        marginTop: '12px', borderRadius: '14px', background: 'var(--c-bg)',
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px',
      },
    }, [
      icon('ph:file-csv', 'text-[18px]'),
      h('div', { style: { flex: '1', minWidth: 0 } }, [
        h('p.num.truncate', { style: { fontSize: '11.5px', fontWeight: '500' } }, info.fileName),
        h('p', { style: { fontSize: '10px', color: 'var(--c-muted)', marginTop: '2px' } },
          `${info.rows} 笔流水 · ${info.size}`),
      ]),
    ]),
    h('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '16px' },
    }, [
      channel('微信', 'ph:wechat-logo', 'var(--c-brand)', 'var(--c-brand-soft)'),
      channel('邮件', 'ph:envelope-simple', 'var(--c-info)', 'color-mix(in srgb, var(--c-info) 12%, var(--c-surface))'),
      channel('文件', 'ph:folder-simple', 'var(--c-ink-soft)', 'var(--c-bg)'),
      channel('隔空投送', 'ph:airplane-tilt', 'var(--c-warn)', 'color-mix(in srgb, var(--c-warn) 12%, var(--c-surface))'),
    ]),
    h('p', {
      style: { fontSize: '10px', color: 'var(--c-faint)', textAlign: 'center', marginTop: '8px' },
    }, '文件已保存到本机，选择分享渠道即可发送'),
  ]);
}

let shareOverlay = null;

function openShareSheet() {
  shareOverlay = createOverlay((close) => buildShareContent(close));
  return shareOverlay;
}

/** 选择分享渠道：优先调用系统分享能力，否则提示文件已落地 */
async function shareTo(label) {
  const info = state.lastExport;
  if (shareOverlay) {
    shareOverlay.close();
    shareOverlay = null;
  }

  if (!info) return;

  if (navigator.share) {
    try {
      await navigator.share({ title: '随手记账导出', text: `${info.rows} 笔流水` });
      return;
    } catch (err) {
      // 用户取消或当前环境不支持，降级为提示
    }
  }
  showToast(`已选择「${label}」· 文件已保存到本机`);
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

let bodyRef = null;

function render() {
  const list = selectedTransactions();
  clear(bodyRef);
  bodyRef.append(
    buildIntroCard(),
    buildRangeSection(list),
    buildIncludeSection(),
    buildFieldsSection(),
    buildPreviewSection(list),
    buildSecurityTip(),
  );
  if (sizeRef) sizeRef.textContent = formatSize(new Blob([buildCsv(list)]).size);
}

function init() {
  const ranges = buildRanges();
  state.customFrom = ranges.last3.from;
  state.customTo = ranges.month.to;

  const action = h('a', {
    href: ROUTES.exportHistory,
    style: { fontSize: '11px', color: 'var(--c-brand)', fontWeight: '500' },
  }, '导出记录');

  const page = createPage({
    title: '数据导出',
    back: ROUTES.settings,
    action,
  });
    // 未登录时已被重定向到登录页
    if (!page) return;

  bodyRef = h('div', {});
  page.body.append(bodyRef);
  page.body.style.paddingBottom = '24px';
  page.frame.append(buildFooter());

  render();
}

init();
