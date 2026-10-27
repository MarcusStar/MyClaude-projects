/**
 * 页面：分类流水明细 —— PRD P-05 / FR-06
 * ------------------------------------------------------------------
 * 展示某个分类下的全部流水：分类概览（合计 / 占比 / 均值）、分类内小统计、
 * 按日分组的流水列表，并支持「按日期 / 按金额」两种排序。
 * 数据全部来自 store，不使用原型里的硬编码数据。
 */

import { h, icon, clear } from '../core/dom.js';
import { createPage } from '../components/shell.js';
import { createTransactionItem, createDivider } from '../components/transaction-item.js';
import { store } from '../core/store.js';
import { ROUTES, TX_TYPE, RULES } from '../core/constants.js';
import {
  formatAmount,
  formatDayLabel,
  formatPercent,
  monthKey,
  shiftMonth,
  toDate,
  weekday,
  monthOverMonth,
} from '../core/format.js';

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

const state = {
  category: null,
  transactions: [],
  sort: 'date',              // date | amount
  limit: RULES.PAGE_SIZE,
};

/** 全部时间内同类型流水的合计，作为占比分母 */
const sameTypeTotal = (type) =>
  store.listTransactions({ type }).reduce((sum, t) => sum + t.amount, 0);

/** 同类型分类排行（按金额降序） */
function buildRanking(type) {
  const buckets = new Map();
  store.listTransactions({ type }).forEach((t) => {
    buckets.set(t.categoryId, (buckets.get(t.categoryId) || 0) + t.amount);
  });
  return Array.from(buckets.entries())
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/* ------------------------------------------------------------------ *
 * 分类定位
 * ------------------------------------------------------------------ */

/**
 * 通过 URL 参数定位分类：
 *   ?categoryId=cat_e_01&name=餐饮  → 直接按 id 取
 *   ?name=餐饮                      → 按名称取
 *   都没有                          → 默认「餐饮」分类
 */
function resolveCategory() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('categoryId');
  const name = params.get('name');

  let category = id ? store.getCategory(id) : null;
  if (!category && name) {
    category = store.listCategories().find((c) => c.name === name) || null;
  }
  if (!category) {
    category =
      store.findCategoryByName('餐饮', TX_TYPE.EXPENSE) ||
      store.listCategories(TX_TYPE.EXPENSE)[0] ||
      store.listCategories()[0] ||
      null;
  }
  return category;
}

/* ------------------------------------------------------------------ *
 * 概览卡
 * ------------------------------------------------------------------ */

function statCell(label, value, color) {
  return h('div', {}, [
    h('p', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)' } }, label),
    h('p.num', {
      style: {
        fontSize: 'var(--fs-lg)',
        fontWeight: '600',
        marginTop: '2px',
        color: color || 'var(--c-ink)',
      },
    }, value),
  ]);
}

function buildOverview(category, transactions) {
  const isIncome = category.type === TX_TYPE.INCOME;
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  const count = transactions.length;
  const average = count ? total / count : 0;

  const denominator = sameTypeTotal(category.type);
  const percent = denominator > 0 ? (total / denominator) * 100 : 0;

  const ranking = buildRanking(category.type);
  const rankIndex = ranking.findIndex((r) => r.id === category.id);
  const rankText = rankIndex >= 0 ? `排名第 ${rankIndex + 1} / ${ranking.length}` : '暂未上榜';

  // 本月 / 上月环比
  const thisMonth = monthKey();
  const lastMonth = shiftMonth(thisMonth, -1);
  const sumOf = (mk) =>
    transactions
      .filter((t) => t.occurredAt.slice(0, 7) === mk)
      .reduce((sum, t) => sum + t.amount, 0);
  const current = sumOf(thisMonth);
  const previous = sumOf(lastMonth);
  const change = monthOverMonth(current, previous);

  const trendText = previous > 0
    ? `本月 ¥${formatAmount(current)} · 上月 ¥${formatAmount(previous)}（${change >= 0 ? '+' : ''}${formatPercent(change)}）`
    : `本月 ¥${formatAmount(current)} · 上月无记录`;

  const typeLabel = isIncome ? '收入分类' : '支出分类';

  return h('section.card', { style: { overflow: 'hidden' } }, [
    h('div', { style: { padding: 'var(--s-5)' } }, [
      h('div.row.gap-3', {}, [
        h('div.icon-badge', {
          style: {
            background: category.color,
            width: '48px',
            height: '48px',
            fontSize: '24px',
            borderRadius: 'var(--r-lg)',
          },
        }, category.icon),
        h('div.flex-1', {}, [
          h('div.row.gap-2', {}, [
            h('h1', { style: { fontSize: 'var(--fs-xl)', fontWeight: '600' } }, category.name),
            h('span.tag.tag--plain', {}, typeLabel),
          ]),
          h('p', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)', marginTop: '2px' } },
            `全部时间 · 共 ${count} 笔`),
        ]),
      ]),
      h('div.grid', {
        style: {
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--s-2)',
          marginTop: 'var(--s-4)',
        },
      }, [
        statCell('分类合计', `¥${formatAmount(total)}`),
        statCell(isIncome ? '收入占比' : '支出占比', formatPercent(percent), 'var(--c-warn)'),
        statCell('单笔均值', `¥${formatAmount(average)}`),
      ]),
    ]),
    h('div', { style: { padding: '0 var(--s-5) var(--s-4)' } }, [
      h('div.progress', {}, [
        h('div.progress__bar.is-warn', { style: { width: `${Math.min(100, percent)}%` } }),
      ]),
      h('div.row-between', {
        style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)', marginTop: 'var(--s-2)' },
      }, [
        h('span', {}, `占全部${isIncome ? '收入' : '支出'} ¥${formatAmount(denominator)} 的 ${formatPercent(percent)}`),
        h('span', { style: { color: 'var(--c-brand)' } }, rankText),
      ]),
    ]),
    h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: 'var(--s-3) var(--s-5)',
        background: 'color-mix(in srgb, var(--c-warn) 12%, var(--c-surface))',
        borderTop: '1px solid var(--c-line-soft)',
      },
    }, [
      icon('ph:trend-up', 'text-[14px]'),
      h('p', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-ink-soft)' } }, trendText),
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 分类内小统计
 * ------------------------------------------------------------------ */

function buildMiniStats(transactions) {
  const maxTx = transactions.reduce(
    (max, t) => (max === null || t.amount > max.amount ? t : max),
    null
  );

  let weekdaySum = 0;
  let weekendSum = 0;
  transactions.forEach((t) => {
    const day = toDate(t.occurredAt).getDay();
    if (day === 0 || day === 6) weekendSum += t.amount;
    else weekdaySum += t.amount;
  });

  const maxDesc = maxTx
    ? `${maxTx.occurredAt.slice(5, 10).replace('-', '/')} · ${maxTx.note || '无备注'}`
    : '暂无记录';

  return h('div.grid', {
    style: { gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)', marginTop: 'var(--s-3)' },
  }, [
    h('div.card', { style: { padding: 'var(--s-3) var(--s-4)' } }, [
      h('p', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)' } }, '最大单笔'),
      h('p.num', { style: { fontSize: 'var(--fs-base)', fontWeight: '600', marginTop: '2px' } },
        maxTx ? `¥${formatAmount(maxTx.amount)}` : '¥0.00'),
      h('p', {
        class: 'truncate',
        style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)', marginTop: '2px' },
      }, maxDesc),
    ]),
    h('div.card', { style: { padding: 'var(--s-3) var(--s-4)' } }, [
      h('p', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)' } }, '工作日 / 周末'),
      h('p.num', { style: { fontSize: 'var(--fs-base)', fontWeight: '600', marginTop: '2px' } },
        `¥${formatAmount(weekdaySum)} / ¥${formatAmount(weekendSum)}`),
      h('p', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)', marginTop: '2px' } },
        weekendSum > weekdaySum ? '周末花得更多' : '工作日花得更多'),
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 流水列表
 * ------------------------------------------------------------------ */

function buildDayHeader(group) {
  return h('div.row-between', { style: { padding: '0 4px', marginBottom: 'var(--s-2)' } }, [
    h('div.row.gap-2', {}, [
      h('span', { style: { fontSize: 'var(--fs-base)', fontWeight: '600' } }, formatDayLabel(group.date)),
      h('span', {
        style: {
          fontSize: 'var(--fs-2xs)',
          color: 'var(--c-muted)',
          border: '1px solid var(--c-line)',
          borderRadius: 'var(--r-full)',
          padding: '1px 6px',
        },
      }, weekday(group.date)),
    ]),
    h('p.num', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)' } },
      `支出 ¥${formatAmount(group.expense)} · 收入 ¥${formatAmount(group.income)}`),
  ]);
}

function txHref(tx) {
  return `${ROUTES.transactionDetail}?id=${encodeURIComponent(tx.id)}`;
}

function buildRowCard(items) {
  const card = h('div.card', { style: { overflow: 'hidden' } });
  items.forEach((tx, index) => {
    if (index > 0) card.append(createDivider());
    card.append(createTransactionItem(tx, { href: txHref(tx) }));
  });
  return card;
}

function buildSortBar() {
  const makeItem = (key, label) =>
    h('button.segment__item', {
      type: 'button',
      dataset: { sort: key },
      class: state.sort === key ? 'is-active' : '',
      onclick: () => switchSort(key),
    }, label);

  return h('div.row-between', { style: { margin: 'var(--s-4) 0 var(--s-2)', padding: '0 4px' } }, [
    h('h2.section-title', { style: { fontSize: 'var(--fs-md)' } }, '流水明细'),
    h('div.segment', {}, [makeItem('date', '按日期'), makeItem('amount', '按金额')]),
  ]);
}

function renderList(listWrap) {
  clear(listWrap);

  const total = state.transactions.length;
  const visible = state.transactions.slice(0, state.limit);

  if (!total) {
    listWrap.append(h('div.empty', {}, [
      h('div.empty__icon', {}, icon('ph:receipt', 'text-[28px]')),
      h('p.empty__title', {}, '这个分类还没有流水'),
      h('p.empty__desc', {}, '记一笔试试，或换一个分类看看'),
    ]));
    return;
  }

  if (state.sort === 'amount') {
    const sorted = visible.slice().sort((a, b) => b.amount - a.amount);
    listWrap.append(buildRowCard(sorted));
  } else {
    store.groupTransactionsByDay(visible).forEach((group) => {
      listWrap.append(
        h('section', {}, [buildDayHeader(group), buildRowCard(group.items)])
      );
    });
  }

  // 分页提示
  const footer = h('div', {
    style: {
      marginTop: 'var(--s-3)',
      padding: 'var(--s-3) var(--s-4)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s-2)',
      background: 'var(--c-surface)',
      border: '1px dashed var(--c-line)',
      borderRadius: 'var(--r-lg)',
    },
  }, [
    icon('ph:dots-three', 'text-[15px]'),
    h('p.flex-1', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)' } },
      visible.length < total
        ? `已展示 ${visible.length} 笔中的 ${total} 笔`
        : `共 ${total} 笔，已全部展示`),
    visible.length < total
      ? h('button', {
        type: 'button',
        style: {
          fontSize: 'var(--fs-2xs)',
          color: 'var(--c-brand)',
          border: '1px solid var(--c-brand-soft)',
          borderRadius: 'var(--r-full)',
          padding: '4px 10px',
        },
        onclick: () => {
          state.limit += RULES.PAGE_SIZE;
          render();
        },
      }, '加载更多')
      : null,
  ]);

  listWrap.append(footer);
}

function switchSort(key) {
  if (state.sort === key) return;
  state.sort = key;
  state.limit = RULES.PAGE_SIZE;
  render();
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

let bodyRef = null;

function render() {
  clear(bodyRef);

  const category = state.category;
  if (!category) {
    bodyRef.append(h('div.empty', {}, [
      h('div.empty__icon', {}, icon('ph:folder-open', 'text-[28px]')),
      h('p.empty__title', {}, '分类不存在'),
      h('p.empty__desc', {}, '换个分类看看吧'),
      h('a.btn.btn--primary', { href: ROUTES.home, style: { marginTop: 'var(--s-2)' } }, '返回首页'),
    ]));
    return;
  }

  const listWrap = h('div', {});
  bodyRef.append(
    buildOverview(category, state.transactions),
    buildMiniStats(state.transactions),
    buildSortBar(),
    listWrap,
    h('a.row.gap-1', {
      href: ROUTES.statistics,
      style: {
        justifyContent: 'center',
        fontSize: 'var(--fs-sm)',
        color: 'var(--c-brand)',
        padding: 'var(--s-4) 0 var(--s-5)',
      },
    }, [icon('ph:chart-donut', 'text-[15px]'), '返回月度统计查看全部分类'])
  );

  renderList(listWrap);
}

function init() {
  const page = createPage({
    title: '分类流水明细',
    back: ROUTES.home,
  });
    // 未登录时已被重定向到登录页
    if (!page) return;

  state.category = resolveCategory();
  state.transactions = state.category
    ? store.listTransactions({ categoryIds: [state.category.id] })
    : [];

  bodyRef = h('div', {});
  page.body.append(bodyRef);

  render();
}

init();
