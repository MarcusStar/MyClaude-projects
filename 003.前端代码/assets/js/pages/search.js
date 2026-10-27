/**
 * 页面：筛选与搜索 —— PRD P-08 / FR-04
 * ------------------------------------------------------------------
 * 支持时间范围（本月 / 上月 / 近三个月 / 自定义）、收支类型、分类多选与关键词搜索，
 * 多个条件组合生效（PRD FR-04），数据全部来自 store。
 * 「重置」一键恢复默认筛选条件。
 */

import { h, icon, clear } from '../core/dom.js';
import { createPage } from '../components/shell.js';
import { createTransactionItem, createDivider } from '../components/transaction-item.js';
import { store } from '../core/store.js';
import { ROUTES, TX_TYPE } from '../core/constants.js';
import {
  dateKey,
  formatAmount,
  monthKey,
  shiftMonth,
  toDate,
} from '../core/format.js';

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

const RANGES = [
  { key: 'month', label: '本月' },
  { key: 'lastMonth', label: '上月' },
  { key: 'last3', label: '近 3 个月' },
  { key: 'custom', label: '自定义' },
];

const TYPES = [
  { key: 'all', label: '全部' },
  { key: TX_TYPE.EXPENSE, label: '支出' },
  { key: TX_TYPE.INCOME, label: '收入' },
];

const state = {
  range: 'month',
  type: 'all',
  categoryIds: [],
  keyword: '',
  from: '',
  to: '',
};

/** 自定义区间的默认值：本月 1 日 ~ 今天 */
function defaultRange() {
  const today = new Date();
  return {
    from: dateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: dateKey(today),
  };
}

/** 近三个月的起始日：往前推两个月的 1 号 */
function last3Start() {
  const today = new Date();
  return dateKey(new Date(today.getFullYear(), today.getMonth() - 2, 1));
}

/* ------------------------------------------------------------------ *
 * 查询
 * ------------------------------------------------------------------ */

/** 把页面筛选状态翻译成 store.listTransactions 的查询参数 */
function buildQuery() {
  const query = { type: state.type };

  if (state.categoryIds.length) query.categoryIds = state.categoryIds;
  if (state.keyword.trim()) query.keyword = state.keyword.trim();

  if (state.range === 'month') {
    query.month = monthKey();
  } else if (state.range === 'lastMonth') {
    query.month = shiftMonth(monthKey(), -1);
  } else if (state.range === 'last3') {
    query.from = last3Start();
    query.to = dateKey(new Date());
  } else {
    query.from = state.from;
    query.to = state.to;
  }

  return query;
}

/* ------------------------------------------------------------------ *
 * 筛选区
 * ------------------------------------------------------------------ */

function buildSearchBox() {
  const clearBtn = h('button', {
    type: 'button',
    'aria-label': '清空关键词',
    style: { color: 'var(--c-muted)', display: state.keyword ? 'flex' : 'none' },
    onclick: () => {
      state.keyword = '';
      refs.keywordInput.value = '';
      clearBtn.style.display = 'none';
      applyFilters();
    },
  }, icon('ph:x-circle-fill', 'text-[16px]'));

  const input = h('input.input', {
    type: 'search',
    placeholder: '搜索备注或分类',
    value: state.keyword,
    'aria-label': '关键词',
    style: { height: '40px', fontSize: 'var(--fs-sm)' },
    oninput: (e) => {
      state.keyword = e.target.value;
      clearBtn.style.display = state.keyword ? 'flex' : 'none';
      applyFilters();
    },
  });

  refs.keywordInput = input;
  refs.clearBtn = clearBtn;

  return h('div.row.gap-2', {
    style: {
      marginTop: 'var(--s-2)',
      padding: '0 var(--s-3)',
      height: '42px',
      borderRadius: 'var(--r-md)',
      background: 'var(--c-surface)',
      border: '1px solid var(--c-line)',
    },
  }, [
    icon('ph:magnifying-glass', 'text-[16px]'),
    input,
    clearBtn,
  ]);
}

function buildRangeSection() {
  const chips = RANGES.map((range) =>
    h('button.chip', {
      type: 'button',
      dataset: { range: range.key },
      class: state.range === range.key ? 'is-active' : '',
      onclick: () => {
        state.range = range.key;
        syncChipStates();
        refs.customPanel.classList.toggle('hidden', state.range !== 'custom');
        applyFilters();
      },
    }, range.label)
  );

  refs.rangeChips = chips;

  const fromInput = h('input.input', {
    type: 'date',
    value: state.from,
    'aria-label': '开始日期',
    style: { height: '34px', fontSize: 'var(--fs-xs)', padding: '0 var(--s-2)' },
    onchange: (e) => {
      state.from = e.target.value;
      applyFilters();
    },
  });

  const toInput = h('input.input', {
    type: 'date',
    value: state.to,
    'aria-label': '结束日期',
    style: { height: '34px', fontSize: 'var(--fs-xs)', padding: '0 var(--s-2)' },
    onchange: (e) => {
      state.to = e.target.value;
      applyFilters();
    },
  });

  refs.fromInput = fromInput;
  refs.toInput = toInput;

  const customPanel = h('div.grid', {
    style: { gridTemplateColumns: '1fr 1fr', gap: 'var(--s-2)', marginTop: 'var(--s-2)' },
    class: state.range === 'custom' ? '' : 'hidden',
  }, [
    h('label', {}, [
      h('p', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)', marginBottom: '2px' } }, '开始日期'),
      fromInput,
    ]),
    h('label', {}, [
      h('p', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)', marginBottom: '2px' } }, '结束日期'),
      toInput,
    ]),
  ]);

  refs.customPanel = customPanel;

  return h('section', { style: { marginTop: 'var(--s-4)' } }, [
    h('h2.section-title', { style: { fontSize: 'var(--fs-sm)', marginBottom: 'var(--s-2)' } }, '时间范围'),
    h('div.row.gap-2', { style: { flexWrap: 'wrap' } }, chips),
    customPanel,
  ]);
}

function buildTypeSection() {
  const chips = TYPES.map((type) =>
    h('button.chip', {
      type: 'button',
      dataset: { type: type.key },
      class: state.type === type.key ? 'is-active' : '',
      onclick: () => {
        state.type = type.key;
        syncChipStates();
        applyFilters();
      },
    }, type.label)
  );

  refs.typeChips = chips;

  return h('section', { style: { marginTop: 'var(--s-4)' } }, [
    h('h2.section-title', { style: { fontSize: 'var(--fs-sm)', marginBottom: 'var(--s-2)' } }, '类型'),
    h('div.row.gap-2', {}, chips),
  ]);
}

function buildCategorySection() {
  const categories = store.listCategories();

  const chips = categories.map((category) =>
    h('button.chip', {
      type: 'button',
      dataset: { categoryId: category.id },
      class: state.categoryIds.includes(category.id) ? 'is-active' : '',
      style: {
        flex: '1 1 0',
        minWidth: '0',
        height: 'auto',
        padding: '6px 2px',
        fontSize: 'var(--fs-2xs)',
        gap: '2px',
      },
      onclick: () => {
        const id = category.id;
        state.categoryIds = state.categoryIds.includes(id)
          ? state.categoryIds.filter((cid) => cid !== id)
          : [...state.categoryIds, id];
        syncChipStates();
        applyFilters();
      },
    }, [h('span', {}, category.icon), h('span.truncate', {}, category.name)])
  );

  refs.categoryChips = chips;

  return h('section', { style: { marginTop: 'var(--s-4)' } }, [
    h('div.row-between', { style: { marginBottom: 'var(--s-2)', padding: '0 4px' } }, [
      h('h2.section-title', { style: { fontSize: 'var(--fs-sm)' } }, '分类'),
      h('button', {
        type: 'button',
        style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)' },
        onclick: () => {
          state.categoryIds = [];
          syncChipStates();
          applyFilters();
        },
      }, '重置'),
    ]),
    h('div.grid', {
      style: { gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-2)' },
    }, chips),
  ]);
}

/** 同步所有 chip 的选中态 */
function syncChipStates() {
  refs.rangeChips.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.range === state.range);
  });
  refs.typeChips.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.type === state.type);
  });
  refs.categoryChips.forEach((btn) => {
    btn.classList.toggle('is-active', state.categoryIds.includes(btn.dataset.categoryId));
  });
}

/* ------------------------------------------------------------------ *
 * 结果区
 * ------------------------------------------------------------------ */

function buildResultSection() {
  const count = h('span.num', {
    style: { color: 'var(--c-brand)', fontWeight: '600' },
  }, '0');

  const sum = h('p.num', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)' } }, '');

  const list = h('div', {});
  const empty = h('div.empty', {}, [
    h('div.empty__icon', {}, icon('ph:magnifying-glass', 'text-[26px]')),
    h('p.empty__title', {}, '没有找到符合条件的流水'),
    h('p.empty__desc', {}, '试试放宽时间范围或去掉关键词'),
    h('button.btn.btn--ghost', {
      type: 'button',
      style: { marginTop: 'var(--s-2)', height: '36px' },
      onclick: resetAll,
    }, '重置全部筛选'),
  ]);

  refs.resultCount = count;
  refs.resultSum = sum;
  refs.resultList = list;
  refs.emptyState = empty;

  const section = h('section', { style: { marginTop: 'var(--s-4)' } }, [
    h('div.row-between', { style: { marginBottom: 'var(--s-2)', padding: '0 4px' } }, [
      h('h2.section-title', { style: { fontSize: 'var(--fs-sm)' } }, ['筛选结果 ', count, ' 笔']),
      sum,
    ]),
    h('div.card', { style: { overflow: 'hidden' } }, [list, empty]),
  ]);

  refs.resultSection = section;
  return section;
}

/** 渲染筛选结果 */
function renderResults(results) {
  const expense = results
    .filter((t) => t.type === TX_TYPE.EXPENSE)
    .reduce((sum, t) => sum + t.amount, 0);
  const income = results
    .filter((t) => t.type === TX_TYPE.INCOME)
    .reduce((sum, t) => sum + t.amount, 0);

  refs.resultCount.textContent = String(results.length);
  refs.resultSum.textContent = income > 0
    ? `合计支出 ¥${formatAmount(expense)} · 收入 ¥${formatAmount(income)}`
    : `合计支出 ¥${formatAmount(expense)}`;

  clear(refs.resultList);
  refs.emptyState.classList.toggle('hidden', results.length > 0);

  results.forEach((tx, index) => {
    if (index > 0) refs.resultList.append(createDivider());
    refs.resultList.append(createTransactionItem(tx, {
      href: `${ROUTES.transactionDetail}?id=${encodeURIComponent(tx.id)}`,
    }));
  });
}

/** 应用当前筛选条件 */
function applyFilters() {
  renderResults(store.listTransactions(buildQuery()));
}

/** 一键恢复默认（PRD FR-04） */
function resetAll() {
  const range = defaultRange();
  state.range = 'month';
  state.type = 'all';
  state.categoryIds = [];
  state.keyword = '';
  state.from = range.from;
  state.to = range.to;

  refs.keywordInput.value = '';
  refs.clearBtn.style.display = 'none';
  refs.fromInput.value = range.from;
  refs.toInput.value = range.to;
  refs.customPanel.classList.add('hidden');

  syncChipStates();
  applyFilters();
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

let refs = {};

function buildBottomBar() {
  return h('div', {
    style: {
      flexShrink: '0',
      display: 'flex',
      gap: 'var(--s-3)',
      padding: 'var(--s-3) var(--s-5)',
      background: 'var(--c-surface)',
      borderTop: '1px solid var(--c-line)',
    },
  }, [
    h('button.btn.btn--ghost', {
      type: 'button',
      style: { width: '110px' },
      onclick: resetAll,
    }, '重置'),
    h('button.btn.btn--primary.flex-1', {
      type: 'button',
      onclick: () => {
        refs.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }, '查看结果'),
  ]);
}

function init() {
  const page = createPage({
    title: '搜索与筛选',
    back: ROUTES.home,
  });
    // 未登录时已被重定向到登录页
    if (!page) return;

  const range = defaultRange();
  state.from = range.from;
  state.to = range.to;

  const body = h('div', { style: { paddingBottom: 'var(--s-4)' } }, [
    buildSearchBox(),
    buildRangeSection(),
    buildTypeSection(),
    buildCategorySection(),
    buildResultSection(),
  ]);

  page.body.append(body);
  page.frame.append(buildBottomBar());

  applyFilters();
}

init();
