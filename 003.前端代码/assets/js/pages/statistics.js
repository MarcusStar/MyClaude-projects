/**
 * 页面：月度统计 —— PRD P-04 / FR-06
 * ------------------------------------------------------------------
 * 收支总览（含环比）、支出分类占比环形图、每日支出柱状图、
 * 支出分类排行与月度小结。所有数据均由 store 实时计算，
 * 支持左右切换月份（不允许切到未来月份），图表随月份重绘。
 */

import { h, icon, clear, go } from '../core/dom.js';
import { createPage } from '../components/shell.js';
import { actionSheet } from '../components/dialog.js';
import { store } from '../core/store.js';
import { ROUTES } from '../core/constants.js';
import {
  dateKey,
  formatAmount,
  formatCompact,
  formatMonthLabel,
  formatPercent,
  monthKey,
  shiftMonth,
} from '../core/format.js';

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** PRD FR-06 R3：分类超过 8 个时，尾部合并为「其他」 */
const MAX_SEGMENTS = 8;

/** 最多可向前回看的月份数 */
const MAX_MONTH_BACK = 12;

/** 环形图配色：全部来自 tokens.css，避免硬编码色值 */
const SEGMENT_COLORS = [
  'var(--c-brand)',
  'color-mix(in srgb, var(--c-brand) 55%, var(--c-surface))',
  'var(--c-warn)',
  'color-mix(in srgb, var(--c-warn) 50%, var(--c-surface))',
  'var(--c-info)',
  'color-mix(in srgb, var(--c-info) 52%, var(--c-surface))',
  'var(--c-brand-deep)',
  'var(--c-muted)',
];

/** 合并后的「其他」配色 */
const OTHER_COLOR = 'var(--c-faint)';

/** 柱状图默认柱色 */
const BAR_COLOR = 'color-mix(in srgb, var(--c-brand) 34%, var(--c-surface))';

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

const state = {
  month: monthKey(),
};

let bodyRef = null;

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 创建 SVG 元素（h() 只能创建 HTML 元素） */
function s(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    el.setAttribute(key, String(value));
  });
  return el;
}

/** 是否未来月份（YYYY-MM 字符串可直接比较） */
function isFutureMonth(mk) {
  return mk > monthKey();
}

/** 收集当前月份的全部统计数据 */
function collectData(mk) {
  return {
    mk,
    summary: store.summary(mk),
    mom: store.monthOverMonth(mk),
    categories: store.categoryStats(mk, 'expense'),
    daily: store.dailyStats(mk, 'expense'),
    budget: store.getBudget(mk),
    transactions: store.listTransactions({ month: mk }),
  };
}

/**
 * 计算环形图 / 排行的分段数据
 * 超过 8 个分类时把尾部合并为「其他」（PRD FR-06 R3）
 */
function buildSegments(categories) {
  const toItem = (category, index) => ({
    ...category,
    color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
    bgColor: category.color,
    merged: false,
  });

  if (categories.length <= MAX_SEGMENTS) {
    return { items: categories.map(toItem), mergedCount: 0 };
  }

  const head = categories.slice(0, MAX_SEGMENTS - 1);
  const tail = categories.slice(MAX_SEGMENTS - 1);
  const amount = tail.reduce((sum, c) => sum + c.amount, 0);
  const count = tail.reduce((sum, c) => sum + c.count, 0);
  const percent = tail.reduce((sum, c) => sum + c.percent, 0);

  const other = {
    id: '__other__',
    name: '其他',
    icon: '📦',
    amount,
    count,
    percent,
    color: OTHER_COLOR,
    bgColor: 'var(--c-line-soft)',
    merged: true,
    children: tail,
  };

  return { items: [...head.map(toItem), other], mergedCount: tail.length };
}

/* ------------------------------------------------------------------ *
 * 月份切换
 * ------------------------------------------------------------------ */

function changeMonth(dir) {
  const next = shiftMonth(state.month, dir);
  if (isFutureMonth(next)) return;
  if (dir < 0 && state.month <= shiftMonth(monthKey(), -MAX_MONTH_BACK)) return;
  state.month = next;
  render();
}

async function openMonthPicker() {
  const months = [];
  const base = new Date();
  for (let i = 0; i < MAX_MONTH_BACK; i += 1) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    months.push(monthKey(d));
  }

  const picked = await actionSheet('选择统计月份', months.map((mk) => ({
    label: formatMonthLabel(mk) + (mk === state.month ? '  ✓' : ''),
    value: mk,
  })));

  if (!picked || picked === state.month) return;
  state.month = picked;
  render();
}

function buildMonthSwitcher(data) {
  const arrow = (dir, label, iconName, disabled) =>
    h('button', {
      type: 'button',
      'aria-label': label,
      disabled,
      style: {
        width: '32px', height: '32px', borderRadius: 'var(--r-full)',
        background: 'var(--c-surface)', border: '1px solid var(--c-line)',
        color: disabled ? 'var(--c-faint)' : 'var(--c-ink-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? '0.6' : '1',
      },
      onclick: () => changeMonth(dir),
    }, icon(iconName, 'text-[15px]'));

  const center = h('button', {
    type: 'button',
    class: 'row gap-1',
    'aria-label': '选择月份',
    onclick: openMonthPicker,
  }, [
    h('p', { style: { fontSize: '15px', fontWeight: '600' } }, formatMonthLabel(state.month)),
    icon('ph:caret-down', 'text-[11px]'),
  ]);

  const hint = h('p', {
    style: { fontSize: '10.5px', color: 'var(--c-muted)', marginTop: '2px' },
  }, data.summary.count
    ? `已记录 ${data.summary.days} 天 · ${data.summary.count} 笔`
    : '本月还没有记账记录');

  return h('div.row-between', { style: { marginTop: '2px' } }, [
    arrow(-1, '上个月', 'ph:caret-left', false),
    h('div', { style: { textAlign: 'center' } }, [center, hint]),
    arrow(1, '下个月', 'ph:caret-right', isFutureMonth(shiftMonth(state.month, 1))),
  ]);
}

/* ------------------------------------------------------------------ *
 * 收支总览（PRD FR-06 R4：上月无数据不展示环比）
 * ------------------------------------------------------------------ */

function buildMoM(value, kind) {
  if (value === null || value === undefined) return null;
  const up = value >= 0;
  const bad = kind === 'expense' ? up : !up;
  return h('p.row.gap-1', {
    style: { fontSize: '10px', color: bad ? 'var(--c-expense)' : 'var(--c-brand)', marginTop: '4px' },
  }, [
    icon(up ? 'ph:arrow-up-right' : 'ph:arrow-down-right', 'text-[10px]'),
    h('span', {}, `环比 ${Math.abs(value).toFixed(1)}%`),
  ]);
}

function kpiCard(label, value, footer) {
  return h('div.card', { style: { padding: '14px 12px' } }, [
    h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)' } }, label),
    h('p.num', {
      style: { fontSize: '16px', fontWeight: '600', marginTop: '6px', lineHeight: '1' },
    }, value),
    footer || h('span', { style: { display: 'block', height: '14px' } }),
  ]);
}

function buildKpiRow(data) {
  const { summary, mom } = data;

  const savingRate = summary.income > 0
    ? `储蓄率 ${formatPercent((summary.balance / summary.income) * 100)}`
    : '本月暂无收入';

  const cards = [
    kpiCard('本月支出', formatAmount(summary.expense), buildMoM(mom.expenseMoM, 'expense')),
    kpiCard('本月收入', formatAmount(summary.income), buildMoM(mom.incomeMoM, 'income')),
    kpiCard('结余', formatAmount(summary.balance), h('p', {
      style: { fontSize: '10px', color: 'var(--c-muted)', marginTop: '4px' },
    }, savingRate)),
  ];

  const noMoM = mom.expenseMoM === null && mom.incomeMoM === null
    ? h('p.row.gap-1', {
        style: {
          fontSize: '10.5px', color: 'var(--c-faint)',
          justifyContent: 'flex-end', marginTop: '8px',
        },
      }, [icon('ph:info', 'text-[11px]'), h('span', {}, '上月无数据，暂不展示环比')])
    : null;

  return h('div', { style: { marginTop: 'var(--s-4)' } }, [
    h('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
    }, cards),
    noMoM,
  ]);
}

/* ------------------------------------------------------------------ *
 * 分类占比环形图
 * ------------------------------------------------------------------ */

function buildDonutSvg(items, total) {
  const R = 46;
  const W = 15;
  const circumference = 2 * Math.PI * R;

  const svg = s('svg', {
    viewBox: '0 0 120 120',
    style: 'width:100%;height:100%;transform:rotate(-90deg);transform-origin:50% 50%;',
  });

  svg.append(s('circle', {
    cx: 60, cy: 60, r: R, fill: 'none',
    stroke: 'var(--c-line-soft)', 'stroke-width': W,
  }));

  let offset = 0;
  items.forEach((seg) => {
    const len = total > 0 ? (seg.amount / total) * circumference : 0;
    if (len <= 0) return;

    const circle = s('circle', {
      cx: 60, cy: 60, r: R, fill: 'none', stroke: seg.color,
      'stroke-dasharray': `${len} ${circumference - len}`,
      'stroke-dashoffset': `${-offset}`,
      'stroke-linecap': 'butt',
      'stroke-width': W,
      style: seg.merged
        ? 'transition:opacity .18s ease;'
        : 'cursor:pointer;transition:opacity .18s ease;',
    });

    circle.addEventListener('mouseenter', () => { circle.style.opacity = '0.75'; });
    circle.addEventListener('mouseleave', () => { circle.style.opacity = '1'; });
    if (!seg.merged) {
      circle.addEventListener('click', () => go(ROUTES.categoryDetail, { name: seg.name }));
    }

    svg.append(circle);
    offset += len;
  });

  return svg;
}

function buildLegend(items) {
  return h('div.flex-1', {
    style: { display: 'flex', flexDirection: 'column', gap: '6px' },
  }, items.map((seg) => h('div.row.gap-2', { style: { fontSize: '11px' } }, [
    h('span', {
      style: {
        width: '8px', height: '8px', borderRadius: 'var(--r-full)',
        background: seg.color, flexShrink: '0',
      },
    }),
    h('span.flex-1.truncate', { style: { color: 'var(--c-ink-soft)' } }, seg.name),
    h('span.num', { style: { fontWeight: '500', flexShrink: '0' } }, formatPercent(seg.percent)),
  ])));
}

function buildDonutCard(data) {
  const { items, mergedCount } = buildSegments(data.categories);
  const total = data.summary.expense;

  const donut = h('div', {
    style: { position: 'relative', width: '142px', height: '142px', flexShrink: '0' },
  }, [
    buildDonutSvg(items, total),
    h('div', {
      style: {
        position: 'absolute', inset: '0', pointerEvents: 'none',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      },
    }, [
      h('p', { style: { fontSize: '10px', color: 'var(--c-muted)' } }, '总支出'),
      h('p.num', {
        style: { fontSize: '16px', fontWeight: '600', marginTop: '2px' },
      }, `¥${formatCompact(total)}`),
    ]),
  ]);

  const subtitle = mergedCount
    ? `共 ${data.categories.length} 个分类 · 前 ${MAX_SEGMENTS - 1} 项展开`
    : `共 ${data.categories.length} 个分类`;

  return h('section.card', { style: { marginTop: 'var(--s-4)', padding: 'var(--s-4)' } }, [
    h('div.row-between', {}, [
      h('div', {}, [
        h('p', { style: { fontSize: '14px', fontWeight: '600' } }, '支出分类占比'),
        h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)', marginTop: '2px' } }, subtitle),
      ]),
      h('a.row.gap-1', {
        href: ROUTES.categoryDetail,
        style: { fontSize: '11px', color: 'var(--c-brand)', flexShrink: '0' },
      }, [h('span', {}, '分类明细'), icon('ph:caret-right', 'text-[11px]')]),
    ]),
    h('div', {
      style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'var(--s-3)' },
    }, [donut, buildLegend(items)]),
    h('p.row.gap-1', {
      style: { fontSize: '10px', color: 'var(--c-faint)', marginTop: 'var(--s-3)' },
    }, [icon('ph:info', 'text-[11px]'), h('span', {}, '分类超过 8 个时，尾部小项自动合并为「其他」')]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 每日支出柱状图
 * ------------------------------------------------------------------ */

let tipTimer = null;

function buildBarCard(data) {
  const { summary } = data;
  const isCurrentMonth = state.month === monthKey();
  const todayKey = dateKey(new Date());

  // 只画到「最后有数据的一天」为止；本月还要画到今天
  const lastDataDay = data.daily.reduce((max, d) => (d.amount > 0 ? Math.max(max, d.day) : max), 0);
  const todayDay = isCurrentMonth ? new Date().getDate() : 0;
  const lastDay = Math.max(lastDataDay, todayDay);
  const daily = data.daily.filter((d) => d.day <= lastDay);

  const max = daily.reduce((m, d) => Math.max(m, d.amount), 0);
  const spentDays = daily.filter((d) => d.amount > 0);
  const maxDay = spentDays.reduce((best, d) => (!best || d.amount > best.amount ? d : best), null);
  const minDay = spentDays.reduce((best, d) => (!best || d.amount < best.amount ? d : best), null);
  const lastSpendDay = spentDays.length ? spentDays[spentDays.length - 1].dateKey : null;

  // 「今天」没有支出时，用最近有支出的一天高亮，保持主色始终可见
  const highlightKey = spentDays.some((d) => d.dateKey === todayKey)
    ? todayKey
    : (lastSpendDay || todayKey);

  const tip = h('div', {
    style: {
      position: 'absolute', pointerEvents: 'none', display: 'none',
      background: 'var(--c-ink)', color: 'var(--c-on-brand)',
      fontSize: '10.5px', padding: '5px 8px', borderRadius: 'var(--r-xs)',
      whiteSpace: 'nowrap', transform: 'translateX(-50%)', zIndex: '5',
    },
  });

  const row = h('div', {
    style: {
      position: 'relative', height: '150px', display: 'flex',
      alignItems: 'flex-end', gap: '2px', overflowX: 'auto',
    },
  });

  daily.forEach((day) => {
    const ratio = max > 0 ? day.amount / max : 0;
    const heightPct = day.amount > 0 ? Math.max(6, ratio * 92) : 0;
    const isHighlight = day.dateKey === highlightKey;
    const isMax = Boolean(maxDay) && day.dateKey === maxDay.dateKey;
    const color = isHighlight ? 'var(--c-brand)' : isMax ? 'var(--c-warn)' : BAR_COLOR;

    const bar = h('button', {
      type: 'button',
      'aria-label': `${Number(state.month.slice(5))}月${day.day}日支出${formatAmount(day.amount)}元`,
      style: {
        width: '100%', height: `${heightPct}%`, flexShrink: '0',
        borderRadius: '4px 4px 0 0', background: color,
        transition: 'opacity .18s ease',
      },
      onclick: () => {
        tip.textContent = `${day.label} 支出 ¥${formatAmount(day.amount)}`;
        const rect = row.getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        tip.style.left = `${barRect.left - rect.left + barRect.width / 2}px`;
        tip.style.top = '0px';
        tip.style.display = 'block';
        clearTimeout(tipTimer);
        tipTimer = setTimeout(() => go(ROUTES.home, { date: day.dateKey }), 450);
      },
      onmouseenter: () => { bar.style.opacity = '0.75'; },
      onmouseleave: () => { bar.style.opacity = '1'; },
    });

    const label = h('span', {
      style: {
        fontSize: '7.5px', marginTop: '4px', flexShrink: '0', whiteSpace: 'nowrap',
        color: isHighlight ? 'var(--c-brand)' : isMax ? 'var(--c-warn)' : 'var(--c-faint)',
        fontWeight: isHighlight ? '500' : '400',
      },
    }, String(day.day));

    row.append(h('div', {
      style: {
        flex: '1 1 0%', minWidth: '0', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
      },
    }, [bar, label]));
  });

  const grid = h('div', {
    style: {
      position: 'absolute', inset: '0', pointerEvents: 'none',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    },
  }, Array.from({ length: 4 }, () => h('div', {
    style: { borderTop: '1px dashed var(--c-line-soft)' },
  })));

  const wrap = h('div', { style: { position: 'relative', marginTop: 'var(--s-4)' } }, [grid, row, tip]);

  const rangeText = data.transactions.length
    ? `${Number(state.month.slice(5))} 月 ${data.transactions[data.transactions.length - 1].occurredAt.slice(8, 10)} 日 - ${data.transactions[0].occurredAt.slice(8, 10)} 日 · 点击柱子查看当日明细`
    : '本月暂无数据';

  return h('section.card', { style: { marginTop: 'var(--s-4)', padding: 'var(--s-4)' } }, [
    h('div.row-between', { style: { alignItems: 'flex-start' } }, [
      h('div', {}, [
        h('p', { style: { fontSize: '14px', fontWeight: '600' } }, '每日支出'),
        h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)', marginTop: '2px' } }, rangeText),
      ]),
      h('div', { style: { textAlign: 'right', flexShrink: '0' } }, [
        h('p', { style: { fontSize: '10px', color: 'var(--c-muted)' } }, '日均'),
        h('p.num', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--c-brand)' } },
          `¥${formatAmount(summary.averagePerDay)}`),
      ]),
    ]),
    wrap,
    h('div.row-between', {
      style: {
        marginTop: 'var(--s-3)', paddingTop: 'var(--s-3)',
        borderTop: '1px solid var(--c-line-soft)',
      },
    }, [
      statLine('最高', maxDay),
      statLine('最低', minDay),
    ]),
  ]);
}

function statLine(label, day) {
  return h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)' } }, [
    h('span', {}, `${label}：${day ? day.label : '—'}`),
    ' ',
    h('span.num', { style: { color: 'var(--c-ink-soft)', fontWeight: '500' } },
      day ? `¥${formatAmount(day.amount)}` : ''),
  ]);
}

/* ------------------------------------------------------------------ *
 * 支出分类排行
 * ------------------------------------------------------------------ */

function buildRankRow(seg, days) {
  const daily = days > 0 ? seg.amount / days : 0;
  return h('a', {
    class: 'row',
    href: `${ROUTES.categoryDetail}?name=${encodeURIComponent(seg.name)}`,
    style: { gap: '12px', padding: '14px 16px' },
  }, [
    h('div', {
      style: {
        width: '36px', height: '36px', borderRadius: 'var(--r-sm)',
        background: seg.bgColor, fontSize: '17px', flexShrink: '0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      },
    }, seg.icon),
    h('div.flex-1', { style: { minWidth: '0' } }, [
      h('p', { style: { fontSize: '13.5px', fontWeight: '500' } }, seg.name),
      h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)', marginTop: '2px' } },
        `${seg.count} 笔 · 日均 ¥${formatAmount(daily)}`),
      h('div.progress', { style: { height: '4px', marginTop: '6px' } }, [
        h('div.progress__bar', { style: { width: `${Math.min(100, seg.percent)}%` } }),
      ]),
    ]),
    h('div', { style: { textAlign: 'right', flexShrink: '0' } }, [
      h('p.num', { style: { fontSize: '13.5px', fontWeight: '600' } }, `¥${formatAmount(seg.amount)}`),
      h('p', { style: { fontSize: '10px', color: 'var(--c-muted)', marginTop: '2px' } },
        formatPercent(seg.percent)),
    ]),
    icon('ph:caret-right', 'text-[13px]'),
  ]);
}

function buildRankCard(data) {
  const { items } = buildSegments(data.categories);
  const days = data.summary.days;

  const card = h('div.card', { style: { overflow: 'hidden' } });

  items.forEach((seg, index) => {
    if (index > 0) {
      card.append(h('div', {
        style: { height: '1px', background: 'var(--c-line-soft)', marginLeft: '64px' },
      }));
    }

    if (!seg.merged) {
      card.append(buildRankRow(seg, days));
      return;
    }

    // 「其他」为合并项：点击展开被合并的小分类
    const detail = h('div', {
      style: { display: 'none', padding: '0 16px 12px', background: 'var(--c-brand-softer)' },
    }, seg.children.map((child) => h('div.row-between', {
      style: { padding: '6px 0', fontSize: '11.5px', color: 'var(--c-ink-soft)' },
    }, [
      h('span', {}, `${child.icon} ${child.name}`),
      h('span.num', {}, `¥${formatAmount(child.amount)}`),
    ])));

    const caret = icon('ph:caret-down', 'text-[13px]');
    const toggle = h('button', {
      type: 'button',
      class: 'row',
      style: { gap: '12px', padding: '14px 16px', width: '100%', textAlign: 'left' },
      onclick: () => {
        const hidden = detail.style.display === 'none';
        detail.style.display = hidden ? 'block' : 'none';
        caret.setAttribute('icon', hidden ? 'ph:caret-up' : 'ph:caret-down');
      },
    }, [
      h('div', {
        style: {
          width: '36px', height: '36px', borderRadius: 'var(--r-sm)',
          background: seg.bgColor, fontSize: '17px', flexShrink: '0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      }, seg.icon),
      h('div.flex-1', { style: { minWidth: '0' } }, [
        h('p', { style: { fontSize: '13.5px', fontWeight: '500' } }, [
          '其他 ',
          h('span', { style: { fontSize: '10px', color: 'var(--c-muted)', fontWeight: '400' } },
            `（合并 ${seg.children.length} 项）`),
        ]),
        h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)', marginTop: '2px' } },
          seg.children.map((c) => c.name).join(' / ')),
      ]),
      h('div', { style: { textAlign: 'right', flexShrink: '0' } }, [
        h('p.num', { style: { fontSize: '13.5px', fontWeight: '600' } }, `¥${formatAmount(seg.amount)}`),
        h('p', { style: { fontSize: '10px', color: 'var(--c-muted)', marginTop: '2px' } },
          formatPercent(seg.percent)),
      ]),
      caret,
    ]);

    card.append(toggle, detail);
  });

  return h('section', { style: { marginTop: 'var(--s-4)' } }, [
    h('div.row-between', { style: { padding: '0 4px', marginBottom: '8px' } }, [
      h('p', { style: { fontSize: '14px', fontWeight: '600' } }, '支出分类明细'),
      h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)' } }, '按金额降序'),
    ]),
    card,
  ]);
}

/* ------------------------------------------------------------------ *
 * 月度小结
 * ------------------------------------------------------------------ */

function buildInsightCard(data) {
  const { summary, mom, categories, budget } = data;
  const lines = [];

  const top = categories[0];
  if (top) {
    lines.push(`「${top.name}」是本月花得最多的分类，占 ${formatPercent(top.percent)}，共 ¥${formatAmount(top.amount)}（${top.count} 笔）。`);
  }

  if (mom.expenseMoM !== null) {
    const diff = summary.expense - mom.previous.expense;
    lines.push(diff >= 0
      ? `本月支出比上月多 ¥${formatAmount(diff)}（+${mom.expenseMoM.toFixed(1)}%），留意大额支出。`
      : `本月支出比上月少 ¥${formatAmount(Math.abs(diff))}（${mom.expenseMoM.toFixed(1)}%），继续保持。`);
  }

  lines.push(`日均支出 ¥${formatAmount(summary.averagePerDay)}（按有记录的 ${summary.days} 天计）。`);

  if (budget) {
    const daysLeft = store.daysLeftInMonth(state.month);
    const advice = daysLeft > 0 && budget.remain > 0
      ? budget.remain / daysLeft
      : 0;
    lines.push(budget.remain > 0
      ? `预算还剩 ¥${formatAmount(budget.remain)}，建议日均不超过 ¥${formatAmount(advice)}。`
      : '本月预算已超支，建议下月适当上调额度或控制支出。');
  } else {
    lines.push('本月还没设置预算，可以到「预算」页设定额度后跟踪进度。');
  }

  return h('section', {
    style: {
      marginTop: 'var(--s-4)', borderRadius: 'var(--r-xl)',
      background: 'var(--c-brand-soft)', padding: '14px 16px',
    },
  }, [
    h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px' } }, [
      h('div', {
        style: {
          width: '32px', height: '32px', borderRadius: 'var(--r-full)',
          background: 'var(--c-surface)', flexShrink: '0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      }, icon('ph:sparkle', 'text-[16px]')),
      h('div.flex-1', {}, [
        h('p', { style: { fontSize: '12px', fontWeight: '500', color: 'var(--c-brand-deep)' } }, '本月小结'),
        h('p', {
          style: {
            fontSize: '11px', color: 'var(--c-ink-soft)',
            marginTop: '4px', lineHeight: '1.7',
          },
        }, lines.join(' ')),
      ]),
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

function buildFooter(data) {
  const latest = data.transactions.length
    ? data.transactions[0].occurredAt.slice(0, 10).replace(/-/g, '/')
    : '—';
  return h('p', {
    class: 'text-center',
    style: { fontSize: '10px', color: 'var(--c-faint)', margin: 'var(--s-4) 0 var(--s-2)' },
  }, `数据统计截至 ${latest}`);
}

function buildEmptyCard() {
  return h('section.card', { style: { marginTop: 'var(--s-4)', padding: 'var(--s-6) 0' } }, [
    h('div.empty', {}, [
      h('div.empty__icon', {}, icon('ph:chart-donut', 'text-[28px]')),
      h('p.empty__title', {}, '本月还没有数据'),
      h('p.empty__desc', {}, '记一笔之后这里就会生成收支报告'),
    ]),
  ]);
}

function render() {
  clear(bodyRef);
  const data = collectData(state.month);

  bodyRef.append(buildMonthSwitcher(data));

  if (!data.summary.count) {
    bodyRef.append(buildEmptyCard(), buildFooter(data));
    return;
  }

  bodyRef.append(
    buildKpiRow(data),
    buildDonutCard(data),
    buildBarCard(data),
    buildRankCard(data),
    buildInsightCard(data),
    buildFooter(data)
  );
}

function init() {
  const action = h('div.row.gap-2', {}, [
    h('a.app-header__action', {
      href: ROUTES.search,
      'aria-label': '筛选与搜索',
    }, icon('ph:funnel', 'text-[17px]')),
    h('a.app-header__action', {
      href: ROUTES.exportData,
      'aria-label': '导出数据',
    }, icon('ph:export', 'text-[17px]')),
  ]);

  const page = createPage({
    title: '月度统计',
    subtitle: '消费分析',
    tab: 'statistics',
    action,
  });
    // 未登录时已被重定向到登录页
    if (!page) return;

  bodyRef = h('div', {});
  page.body.append(bodyRef);

  render();
}

init();
