/**
 * 记账面板（Record Sheet）
 * ------------------------------------------------------------------
 * PRD FR-01 记支出 / FR-02 记收入 / FR-05 编辑流水
 * 同一个组件承担新增与编辑两种模式，编辑时回填原有数据。
 */

import { h, icon, clear, getOverlayHost } from '../core/dom.js';
import { store } from '../core/store.js';
import { TX_TYPE, RULES } from '../core/constants.js';
import { dateKey, formatMonthDay, toDate } from '../core/format.js';
import { showToast } from '../core/toast.js';
import { confirmDialog } from './dialog.js';

/* ------------------------------------------------------------------ *
 * 内部状态
 * ------------------------------------------------------------------ */

const draft = {
  type: TX_TYPE.EXPENSE,
  amount: '',
  categoryId: '',
  note: '',
  occurredAt: '',
};

let refs = {};
let onSavedCallback = null;

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

function todayISO() {
  return dateKey(new Date());
}

function fiveYearsAgoISO() {
  const now = new Date();
  return dateKey(new Date(now.getFullYear() - RULES.DATE_RANGE_YEARS, now.getMonth(), now.getDate()));
}

function renderAmount() {
  const raw = draft.amount;
  // 始终展示两位小数：38 → 38.00，38.5 → 38.50
  let display = '0.00';
  if (raw !== '') {
    const [int, dec = ''] = raw.split('.');
    display = `${int}.${dec.padEnd(2, '0')}`;
  }
  refs.amountDisplay.textContent = display;

  const active = parseFloat(raw || '0') > 0;
  const enabled = active && Boolean(draft.categoryId);

  refs.saveBtn.classList.toggle('is-disabled', !enabled);
  refs.saveNextBtn.classList.toggle('is-disabled', !enabled);
  refs.saveBtn.style.background = enabled ? 'var(--c-brand)' : '#8FC9AE';
  refs.saveNextBtn.style.borderColor = enabled ? '#DCEBE3' : '#EDF1EE';
  refs.saveNextBtn.style.color = enabled ? 'var(--c-brand)' : '#B4BDB7';
}

function renderCategoryGrid() {
  const categories = store.listCategories(draft.type);
  clear(refs.categoryGrid);

  categories.forEach((category) => {
    const active = category.id === draft.categoryId;
    refs.categoryGrid.append(
      h('button', {
        type: 'button',
        class: 'flex flex-col items-center gap-1 py-1 rounded-[12px]',
        style: active ? { background: 'var(--c-brand-softer)' } : {},
        onclick: () => {
          draft.categoryId = category.id;
          renderCategoryGrid();
          renderAmount();
        },
      }, [
        h('span', {
          class: 'w-8 h-8 rounded-full flex items-center justify-center text-[16px]',
          style: { background: category.color },
        }, category.icon),
        h('span', {
          style: {
            fontSize: '10.5px',
            color: active ? 'var(--c-brand)' : 'var(--c-ink-soft)',
            fontWeight: active ? '500' : '400',
          },
        }, category.name),
      ])
    );
  });

  refs.pickedCategory.textContent =
    categories.find((c) => c.id === draft.categoryId)?.name || '未选择';
}

function setType(type) {
  draft.type = type;
  const isExpense = type === TX_TYPE.EXPENSE;

  refs.tabExpense.className =
    `px-4 py-1.5 rounded-full text-[12.5px] ${isExpense ? 'font-medium bg-white text-[#17241F] shadow-sm' : 'text-[#8A968F]'}`;
  refs.tabIncome.className =
    `px-4 py-1.5 rounded-full text-[12.5px] ${!isExpense ? 'font-medium bg-white text-[#17241F] shadow-sm' : 'text-[#8A968F]'}`;

  // 切换类型后回到该类型的默认分类（PRD FR-01 R3）
  const categories = store.listCategories(type);
  const remembered = store.getSettings().lastCategory?.[type];
  draft.categoryId =
    categories.find((c) => c.id === remembered)?.id ||
    categories.find((c) => c.name === (isExpense ? '餐饮' : '工资'))?.id ||
    categories[0]?.id ||
    '';

  renderCategoryGrid();
  renderAmount();
}

/* ------------------------------------------------------------------ *
 * 金额键盘
 * ------------------------------------------------------------------ */

function pressKey(key) {
  if (key === '.') {
    if (draft.amount.includes('.')) return;
    draft.amount = draft.amount === '' ? '0.' : `${draft.amount}.`;
    renderAmount();
    return;
  }
  const parts = draft.amount.split('.');
  if (parts[1] && parts[1].length >= 2) return;
  if (draft.amount.replace('.', '').length >= 8) return;
  if (draft.amount === '0') draft.amount = key;
  else draft.amount += key;
  renderAmount();
}

function backspace() {
  draft.amount = draft.amount.slice(0, -1);
  renderAmount();
}

function clearAmount() {
  draft.amount = '';
  renderAmount();
}

/* ------------------------------------------------------------------ *
 * 保存
 * ------------------------------------------------------------------ */

function collectPayload() {
  return {
    type: draft.type,
    amount: parseFloat(draft.amount || '0'),
    categoryId: draft.categoryId,
    note: draft.note,
    occurredAt: draft.occurredAt,
  };
}

async function save({ keepOpen }) {
  const payload = collectPayload();
  const check = store.validateTransaction(payload);

  if (!check.valid) {
    const message = check.errors.amount || check.errors.categoryId || check.errors.note || check.errors.occurredAt;
    showToast(message);
    return;
  }

  const isEdit = Boolean(refs.editingId);
  const result = isEdit
    ? store.updateTransaction(refs.editingId, payload)
    : store.createTransaction(payload);

  if (!result.ok) {
    const first = Object.values(result.errors || {})[0];
    showToast(first || '保存失败');
    return;
  }

  showToast(isEdit ? '已更新' : '已保存');

  if (keepOpen) {
    // 存后继续：清空金额与备注，保留分类以提升连续记账效率（PRD FR-01 R6）
    draft.amount = '';
    draft.note = '';
    refs.noteInput.value = '';
    renderAmount();
    if (onSavedCallback) onSavedCallback(result.transaction, { keepOpen: true });
    return;
  }

  close();
  if (onSavedCallback) onSavedCallback(result.transaction);
}

/* ------------------------------------------------------------------ *
 * 打开 / 关闭
 * ------------------------------------------------------------------ */

let sheetEl = null;
let backdropEl = null;

function close() {
  if (!sheetEl) return;
  backdropEl.classList.remove('is-open');
  sheetEl.classList.remove('is-open');
  setTimeout(() => {
    backdropEl?.remove();
    sheetEl?.remove();
    sheetEl = null;
    backdropEl = null;
  }, 300);
}

function buildSheet() {
  const backdrop = h('div.backdrop');
  const sheet = h('section.sheet', { role: 'dialog', 'aria-modal': 'true' });

  /* --- 顶部：类型切换 + 关闭 --- */
  const tabExpense = h('button', { type: 'button', onclick: () => setType(TX_TYPE.EXPENSE) }, '支出');
  const tabIncome = h('button', { type: 'button', onclick: () => setType(TX_TYPE.INCOME) }, '收入');

  const head = h('div.shrink-0.px-5.flex.items-center.justify-between', {}, [
    h('div.flex.items-center.gap-1.p-0.5.rounded-full', { style: { background: '#F1F5F2' } }, [tabExpense, tabIncome]),
    h('button', {
      type: 'button',
      class: 'w-8 h-8 rounded-full flex items-center justify-center',
      style: { background: '#F4F7F5', color: 'var(--c-ink-soft)' },
      'aria-label': '关闭',
      onclick: close,
    }, icon('ph:x', 'text-[16px]')),
  ]);

  /* --- 金额显示 --- */
  const amountDisplay = h('span.num', {
    style: { fontSize: '40px', fontWeight: '600', lineHeight: '1', color: 'var(--c-ink)' },
  }, '0.00');

  const amountBlock = h('div.shrink-0.px-5.pt-3.pb-2', {}, [
    h('div.flex.items-end.justify-end.gap-1', {
      style: { borderBottom: '1px solid #EDF1EE', paddingBottom: '8px' },
    }, [
      h('span', { style: { fontSize: '18px', color: 'var(--c-ink-soft)', paddingBottom: '4px' } }, '¥'),
      amountDisplay,
      h('span', {
        style: {
          width: '2px',
          height: '36px',
          background: 'var(--c-brand)',
          marginBottom: '2px',
          borderRadius: '2px',
          animation: 'pulse 1.4s ease-in-out infinite',
        },
      }),
    ]),
    h('p.mt-2.flex.items-center.gap-1', { style: { fontSize: '11px', color: 'var(--c-muted)' } }, [
      icon('ph:lightning', 'text-[12px]'),
      h('span', { style: { color: 'var(--c-warn)' } }, ''),
      '先输金额，再选分类，最快 3 秒记完',
    ]),
  ]);

  /* --- 分类选择 --- */
  const pickedCategory = h('span', { style: { fontSize: '11px', color: 'var(--c-brand)' } }, '未选择');
  const categoryGrid = h('div.grid', {
    style: { gridTemplateColumns: 'repeat(4, 1fr)', rowGap: '10px', columnGap: '4px' },
  });

  const categoryBlock = h('div.shrink-0.px-5', {}, [
    h('div.row-between.mb-2', {}, [
      h('p', { style: { fontSize: '12px', fontWeight: '500', color: 'var(--c-ink-soft)' } }, '选择分类'),
      pickedCategory,
    ]),
    categoryGrid,
  ]);

  /* --- 日期与备注 --- */
  const dateInput = h('input', {
    type: 'date',
    // 原生日期输入覆盖在整个标签上：保留系统日期选择器，但只展示自定义文案
    style: {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      opacity: '0',
      cursor: 'pointer',
    },
    max: todayISO(),
    min: fiveYearsAgoISO(),
    'aria-label': '日期',
    onchange: (e) => {
      draft.occurredAt = `${e.target.value} ${(draft.occurredAt || '').slice(11) || '12:00:00'}`;
      updateDateLabel();
    },
  });

  const dateLabel = h('span', {}, formatMonthDay(new Date()));
  const updateDateLabel = () => {
    const day = draft.occurredAt ? draft.occurredAt.slice(0, 10) : todayISO();
    const isToday = day === todayISO();
    dateLabel.textContent = isToday ? `今天 ${day.slice(5).replace('-', '/')}` : day.slice(5).replace('-', '/');
  };

  const noteInput = h('input', {
    type: 'text',
    class: 'bg-transparent outline-none text-[12px] w-full',
    style: { color: 'var(--c-ink)' },
    placeholder: '加个备注（选填）',
    maxlength: String(RULES.MAX_NOTE_LENGTH),
    'aria-label': '备注',
    oninput: (e) => {
      draft.note = e.target.value;
    },
  });

  const metaBlock = h('div.shrink-0.px-5.mt-3.flex.gap-2', {}, [
    h('label', {
      class: 'flex items-center gap-1.5 rounded-[12px] px-3 py-2',
      style: {
        background: '#F4F7F5', fontSize: '12px', color: 'var(--c-ink-soft)',
        position: 'relative', flexShrink: '0',
      },
    }, [icon('ph:calendar-blank', 'text-[14px]'), dateLabel, dateInput]),
    h('div.flex-1.flex.items-center.gap-1.5.rounded-[12px].px-3.py-2', {
      style: { background: '#F4F7F5' },
    }, [icon('ph:pencil-simple', 'text-[14px]'), noteInput]),
  ]);

  /* --- 键盘 --- */
  const keyButton = (label, key) =>
    h('button.key', {
      type: 'button',
      dataset: { key },
      style: {
        height: '48px',
        borderRadius: '14px',
        background: '#F5F8F6',
        fontSize: '20px',
        fontWeight: '500',
      },
      class: 'num',
      onclick: () => pressKey(key),
    }, label);

  const saveBtn = h('button', {
    type: 'button',
    id: 'saveBtn',
    onclick: () => save({ keepOpen: false }),
    style: {
      gridRow: 'span 2',
      height: '100%',
      borderRadius: '14px',
      background: '#8FC9AE',
      color: '#fff',
      fontSize: '14px',
      fontWeight: '600',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
    },
  }, '保存');

  const saveNextBtn = h('button', {
    type: 'button',
    onclick: () => save({ keepOpen: true }),
    style: {
      height: '48px',
      borderRadius: '14px',
      border: '1px solid #EDF1EE',
      color: '#B4BDB7',
      fontSize: '12px',
      fontWeight: '500',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
    },
  }, [icon('ph:check', 'text-[13px]'), '存后继续']);

  const keypad = h('div.shrink-0.px-5.pt-3.pb-4.mt-auto', {}, [
    h('div.grid', { style: { gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' } }, [
      keyButton('1', '1'), keyButton('2', '2'), keyButton('3', '3'),
      h('button', {
        type: 'button',
        style: {
          height: '48px', borderRadius: '14px', background: '#F5F8F6',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-ink-soft)',
        },
        'aria-label': '退格',
        onclick: backspace,
      }, icon('ph:backspace', 'text-[22px]')),
      keyButton('4', '4'), keyButton('5', '5'), keyButton('6', '6'), saveBtn,
      keyButton('7', '7'), keyButton('8', '8'), keyButton('9', '9'),
      keyButton('.', '.'), keyButton('0', '0'),
      h('button', {
        type: 'button',
        style: {
          height: '48px', borderRadius: '14px', background: '#F5F8F6',
          fontSize: '12px', color: 'var(--c-ink-soft)',
        },
        onclick: clearAmount,
      }, '清空'),
      saveNextBtn,
    ]),
  ]);

  sheet.append(
    h('div.sheet__grip'),
    head,
    amountBlock,
    categoryBlock,
    metaBlock,
    keypad
  );

  refs = {
    backdrop, tabExpense, tabIncome, amountDisplay, pickedCategory, categoryGrid,
    noteInput, dateInput, dateLabel, saveBtn, saveNextBtn, editingId: null,
  };

  return { sheet, backdrop };
}

/* ------------------------------------------------------------------ *
 * 对外接口
 * ------------------------------------------------------------------ */

/**
 * 打开记账面板
 * @param {object} [options]
 * @param {object} [options.transaction] 传入则进入编辑模式（PRD FR-05）
 * @param {Function} [options.onSaved]   保存成功回调
 */
export function openRecordSheet(options = {}) {
  const { transaction, onSaved } = options;
  onSavedCallback = onSaved || null;

  const { sheet, backdrop } = buildSheet();
  sheetEl = sheet;
  backdropEl = backdrop;

  const host = getOverlayHost();
  host.append(backdrop, sheet);

  backdrop.addEventListener('click', close);

  if (transaction) {
    // 编辑模式：回填原数据
    refs.editingId = transaction.id;
    draft.type = transaction.type;
    draft.amount = transaction.amount ? String(transaction.amount) : '';
    draft.categoryId = transaction.categoryId;
    draft.note = transaction.note || '';
    draft.occurredAt = transaction.occurredAt;

    refs.noteInput.value = draft.note;
    const day = transaction.occurredAt.slice(0, 10);
    refs.dateInput.value = day;
    refs.dateInput.max = todayISO();
    refs.dateLabel.textContent = day === todayISO()
      ? `今天 ${day.slice(5).replace('-', '/')}`
      : day.slice(5).replace('-', '/');
    setType(transaction.type);
    // setType 会重置分类，这里恢复编辑前的分类
    draft.categoryId = transaction.categoryId;
    renderCategoryGrid();
  } else {
    draft.type = TX_TYPE.EXPENSE;
    draft.amount = '';
    draft.note = '';
    draft.occurredAt = `${todayISO()} ${new Date().toTimeString().slice(0, 8)}`;
    refs.dateInput.value = todayISO();
    setType(TX_TYPE.EXPENSE);
  }

  renderAmount();

  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    sheet.classList.add('is-open');
  });

  return { close };
}

/** 关闭记账面板 */
export function closeRecordSheet() {
  close();
}
