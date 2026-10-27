/**
 * 页面：流水列表（首页）—— PRD P-01 / FR-03
 * ------------------------------------------------------------------
 * 当月收支汇总 + 预算卡片 + 按日分组的流水列表 + 收支类型筛选。
 */

import { h, icon, clear } from '../core/dom.js';
import { createPage } from '../components/shell.js';
import { createTransactionItem, createDivider } from '../components/transaction-item.js';
import { actionSheet } from '../components/dialog.js';
import { store } from '../core/store.js';
import { ROUTES, TX_TYPE } from '../core/constants.js';
import {
  formatAmount,
  formatDayLabel,
  formatMonthLabel,
  monthKey,
  weekday,
} from '../core/format.js';

const state = {
  month: monthKey(),
  type: 'all',
  dayFilter: null,
};

/* ------------------------------------------------------------------ *
 * 顶栏
 * ------------------------------------------------------------------ */

function buildHeader() {
  const logo = h('div', {
    class: 'flex items-center gap-2',
  }, [
    h('div', {
      class: 'w-9 h-9 rounded-[13px] flex items-center justify-center',
      style: { background: 'var(--c-brand-soft)' },
    }, icon('ph:wallet-duotone', 'text-[21px]')),
    h('div', {}, [
      h('p', { style: { fontSize: '11px', color: 'var(--c-muted)', lineHeight: '1', marginBottom: '4px' } }, '小账本 · 第 214 天'),
      h('h1', { style: { fontSize: '17px', fontWeight: '600', lineHeight: '1' } }, '今天也好好记账'),
    ]),
  ]);

  const action = h('a.app-header__action', {
    href: ROUTES.search,
    'aria-label': '搜索与筛选',
  }, icon('ph:magnifying-glass', 'text-[18px]'));

  return h('header.app-header', {}, [
    h('div.row-between', {}, [logo, action]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 当月收支汇总
 * ------------------------------------------------------------------ */

function buildSummary() {
  const data = store.summary(state.month);

  const monthButton = h('button', {
    type: 'button',
    class: 'flex items-center gap-1',
    style: {
      fontSize: '11px',
      color: 'var(--c-brand-tint)',
      background: 'rgba(255,255,255,0.12)',
      borderRadius: '999px',
      padding: '4px 10px',
    },
    onclick: openMonthPicker,
  }, [
    h('span', {}, `${Number(state.month.slice(5))}月`),
    icon('ph:caret-down', 'text-[10px]'),
  ]);

  const section = h('section', {
    class: 'rounded-[24px] px-5 pt-5 pb-[18px] relative overflow-hidden',
    style: { background: '#1E8E60' },
  }, [
    h('div', {
      class: 'absolute',
      style: {
        right: '-32px', top: '-40px', width: '130px', height: '130px',
        borderRadius: '999px', background: 'rgba(255,255,255,0.10)',
      },
    }),
    h('div', {
      class: 'absolute',
      style: {
        right: '32px', top: '56px', width: '36px', height: '36px',
        borderRadius: '999px', background: 'rgba(246,201,118,0.25)',
      },
    }),
    h('div.row-between.relative', {}, [
      h('p', { style: { fontSize: '12px', color: 'var(--c-brand-tint)' } }, `${formatMonthLabel(state.month)} · 本月结余`),
      monthButton,
    ]),
    h('p.num.relative', {
      style: {
        color: '#fff', fontSize: '34px', fontWeight: '600',
        marginTop: '8px', lineHeight: '1',
      },
    }, `¥ ${formatAmount(data.balance)}`),
    h('div.grid.relative', {
      style: { gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' },
    }, [
      summaryCell('#F6C976', '本月支出', data.expense),
      summaryCell('#9BE2B9', '本月收入', data.income),
    ]),
  ]);

  return section;
}

function summaryCell(dotColor, label, value) {
  return h('div', {
    style: {
      background: 'rgba(255,255,255,0.12)',
      borderRadius: '14px',
      padding: '10px 12px',
    },
  }, [
    h('div.row.gap-1', { style: { fontSize: '11px', color: 'var(--c-brand-tint)' } }, [
      h('span', {
        style: {
          width: '6px', height: '6px', borderRadius: '999px', background: dotColor,
        },
      }),
      h('span', {}, label),
    ]),
    h('p.num', {
      style: { color: '#fff', fontSize: '16px', fontWeight: '600', marginTop: '4px' },
    }, `¥ ${formatAmount(value)}`),
  ]);
}

/* ------------------------------------------------------------------ *
 * 预算卡片
 * ------------------------------------------------------------------ */

function buildBudgetCard() {
  const budget = store.getBudget(state.month);
  // 未设置预算时不展示（PRD FR-07）
  if (!budget) return null;

  const percent = Math.min(100, Math.round(budget.percent));
  const levelClass = budget.level === 'danger' ? 'is-danger' : budget.level === 'warn' ? 'is-warn' : '';

  const daysLeft = store.daysLeftInMonth(state.month);
  const dailyAdvice = daysLeft > 0 ? budget.remain / daysLeft : 0;

  return h('a', {
    class: 'card block px-5 py-4 mt-3',
    href: ROUTES.budget,
  }, [
    h('div.row-between', { style: { alignItems: 'flex-start' } }, [
      h('div', {}, [
        h('p', { style: { fontSize: '12px', color: 'var(--c-muted)' } },
          `${Number(state.month.slice(5))} 月预算 · 已用 ${Math.round(budget.percent)}%`),
        h('p', { style: { fontSize: '15px', fontWeight: '600', marginTop: '4px' } }, [
          budget.remain >= 0 ? '剩余 ' : '已超支 ',
          h('span', {
            style: {
              color: budget.remain < 0
                ? 'var(--c-expense)'
                : budget.level === 'safe' ? 'var(--c-brand)' : 'var(--c-warn)',
            },
          }, `¥ ${formatAmount(Math.abs(budget.remain))}`),
        ]),
      ]),
      h('div', { style: { textAlign: 'right' } }, [
        h('p.num', { style: { fontSize: '11px', color: 'var(--c-muted)' } },
          `¥${formatAmount(budget.spent)} / ¥${formatAmount(budget.amount)}`),
        h('div.row.gap-1.mt-1', {
          style: { fontSize: '11px', color: 'var(--c-brand)', justifyContent: 'flex-end' },
        }, [
          h('span', {}, '查看预算详情'),
          icon('ph:caret-right', 'text-[11px]'),
        ]),
      ]),
    ]),
    h('div.progress.mt-3', { style: { height: '8px' } }, [
      h('div.progress__bar', {
        class: levelClass,
        style: { width: `${percent}%` },
      }),
    ]),
    h('p.mt-2', { style: { fontSize: '10.5px', color: 'var(--c-muted)' } },
      daysLeft > 0
        ? `本月还剩 ${daysLeft} 天 · 建议日均支出不超过 ¥ ${formatAmount(Math.max(0, dailyAdvice))}`
        : '本月已结束，下月 1 日自动重置预算进度'),
  ]);
}

/* ------------------------------------------------------------------ *
 * 流水列表
 * ------------------------------------------------------------------ */

function buildListSection() {
  const filters = ['all', TX_TYPE.EXPENSE, TX_TYPE.INCOME].map((key) => {
    const label = { all: '全部', expense: '支出', income: '收入' }[key];
    return h('button', {
      type: 'button',
      class: `px-3 py-1 rounded-full text-[11.5px] ${state.type === key ? 'bg-[#1F8A5C] text-white' : 'text-[#4B5A53]'}`,
      dataset: { filter: key },
      onclick: () => {
        state.type = key;
        filters.forEach((btn) => {
          const active = btn.dataset.filter === key;
          btn.className = `px-3 py-1 rounded-full text-[11.5px] ${active ? 'bg-[#1F8A5C] text-white' : 'text-[#4B5A53]'}`;
        });
        renderList();
      },
    }, label);
  });

  const listWrap = h('div.space-y-4', { id: 'groups' });
  const emptyTip = h('p.hidden.text-center', {
    style: { fontSize: '12px', color: 'var(--c-muted)', padding: '40px 0' },
  }, '当前筛选下没有流水');
  const footer = h('p.text-center', {
    style: { fontSize: '10.5px', color: 'var(--c-faint)', marginTop: '24px', marginBottom: '8px' },
  });

  const section = h('div', { style: { marginTop: '20px', marginBottom: '12px' } }, [
    h('div.row-between', { style: { marginBottom: '12px' } }, [
      h('h2.section-title', {}, '收支明细'),
      h('div', {
        class: 'flex items-center gap-1 p-0.5 rounded-full',
        style: { background: '#fff', border: '1px solid var(--c-line)' },
      }, filters),
    ]),
    listWrap,
    emptyTip,
    footer,
  ]);

  return { section, listWrap, emptyTip, footer };
}

function renderList() {
  const { listWrap, emptyTip, footer } = listRefs;
  clear(listWrap);

  let transactions = store.listTransactions({ month: state.month });
  if (state.type !== 'all') {
    transactions = transactions.filter((t) => t.type === state.type);
  }

  // 单日筛选（来自统计页柱状图）
  if (state.dayFilter) {
    transactions = transactions.filter((t) => t.occurredAt.slice(0, 10) === state.dayFilter);
  }

  footer.textContent = transactions.length
    ? `已加载 ${Number(state.month.slice(5))} 月共 ${transactions.length} 笔流水`
    : '';

  if (!transactions.length) {
    emptyTip.classList.remove('hidden');
    emptyTip.textContent = '';
    emptyTip.append(
      h('span', { style: { display: 'block', fontSize: '12px', color: 'var(--c-muted)' } }, '当前筛选下没有流水'),
      h('button', {
        type: 'button',
        class: 'btn btn--primary mt-4',
        style: { height: '38px', padding: '0 20px' },
        onclick: () => {
          import('../components/record-sheet.js').then(({ openRecordSheet }) => {
            openRecordSheet({ onSaved: () => render() });
          });
        },
      }, '记一笔')
    );
    return;
  }
  emptyTip.classList.add('hidden');

  const groups = store.groupTransactionsByDay(transactions);

  groups.forEach((group) => {
    const isToday = group.dateKey === new Date().toISOString().slice(0, 10);

    const header = h('div.row-between', { style: { padding: '0 4px', marginBottom: '8px' } }, [
      h('div.row.gap-2', {}, [
        h('span', { style: { fontSize: '13px', fontWeight: '600' } }, formatDayLabel(group.date)),
        h('span', {
          style: {
            fontSize: '10.5px',
            color: 'var(--c-muted)',
            background: isToday ? 'var(--c-brand-soft)' : '#fff',
            border: isToday ? 'none' : '1px solid var(--c-line)',
            borderRadius: '999px',
            padding: '2px 6px',
          },
        }, weekday(group.date)),
      ]),
      h('p.num', { style: { fontSize: '10.5px', color: 'var(--c-muted)' } },
        `支出 ¥${formatAmount(group.expense)} · 收入 ¥${formatAmount(group.income)}`),
    ]);

    const card = h('div.card', { style: { overflow: 'hidden' } });

    group.items.forEach((tx, index) => {
      if (index > 0) card.append(createDivider());
      card.append(createTransactionItem(tx, {
        href: `${ROUTES.transactionDetail}?id=${encodeURIComponent(tx.id)}`,
      }));
    });

    listWrap.append(h('section', { dataset: { day: group.dateKey } }, [header, card]));
  });
}

/* ------------------------------------------------------------------ *
 * 月份选择
 * ------------------------------------------------------------------ */

async function openMonthPicker() {
  const months = [];
  const base = new Date();
  for (let i = 0; i < 6; i += 1) {
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

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 单日筛选提示条
 * ------------------------------------------------------------------ */

function buildDayFilterBanner() {
  if (!state.dayFilter) return null;
  return h('div', {
    class: 'rounded-[16px] px-3.5 py-2.5 row gap-2',
    style: { background: 'var(--c-brand-soft)', marginTop: '12px' },
  }, [
    icon('ph:chart-bar', 'text-[14px]'),
    h('p.flex-1', { style: { fontSize: '10.5px', color: 'var(--c-brand-deep)' } },
      `正在查看 ${state.dayFilter.slice(5).replace('-', '/')} 的收支明细`),
    h('button', {
      type: 'button',
      style: { fontSize: '10.5px', color: 'var(--c-brand)', textDecoration: 'underline' },
      onclick: () => {
        state.dayFilter = null;
        window.history.replaceState({}, '', window.location.pathname);
        render();
      },
    }, '看全部'),
  ]);
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

let listRefs = {};
let bodyRef = null;

function render() {
  clear(bodyRef);

  const summary = buildSummary();
  const banner = buildDayFilterBanner();
  const budget = buildBudgetCard();
  const list = buildListSection();

  listRefs = list;
  bodyRef.append(summary, banner, budget, list.section);
  renderList();
}

function init() {
  const page = createPage({
    tab: 'home',
    fab: true,
    header: buildHeader,
  });
    // 未登录时已被重定向到登录页
    if (!page) return;

  bodyRef = h('div', {});
  page.body.append(bodyRef);

  // 支持从统计页跳转过来时按日期筛选：?date=YYYY-MM-DD
  const params = new URLSearchParams(window.location.search);
  const day = params.get('date');
  if (day) state.dayFilter = day;

  render();
}

init();
