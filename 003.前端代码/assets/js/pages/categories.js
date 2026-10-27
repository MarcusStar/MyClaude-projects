/**
 * 页面：分类管理 —— PRD P-07 / FR-08
 * ------------------------------------------------------------------
 * 查看 / 新增 / 编辑 / 删除收支分类，并支持拖拽排序。
 * 数据全部来自 core/store.js：
 *   R1 预设分类可改名、隐藏，但不可删除；
 *   R2 删除自定义分类时，若其下有流水需二次确认，流水自动归入「其他」；
 *   R3 支出 / 收入分类各自上限 30 个。
 */

import { h, icon, clear } from '../core/dom.js';
import { createPage } from '../components/shell.js';
import { actionSheet, confirmDialog, createOverlay } from '../components/dialog.js';
import { showToast } from '../core/toast.js';
import { store } from '../core/store.js';
import { ROUTES, RULES, TX_TYPE } from '../core/constants.js';
import { monthKey } from '../core/format.js';

/** 可选图标（沿用原型图标库） */
const ICON_PALETTE = ['🐱', '🐶', '✈️', '🎬', '💄', '🏋️', '🎧', '💡'];

/**
 * 可选分类底色。
 * 注意：这是「分类数据」的取值（与种子数据中的分类色同源），
 * 与界面设计令牌（--c-*）性质不同，故不抽进 tokens.css。
 */
const COLOR_PALETTE = ['#FFF1E4', '#E7F4EC', '#E9F1FF', '#F2EEFF', '#FFEDEF', '#F1F3F4'];

const state = {
  type: TX_TYPE.EXPENSE,
};

let bodyRef = null;
let listEl = null;
let dragRow = null;

/* ------------------------------------------------------------------ *
 * 数据读取
 * ------------------------------------------------------------------ */

/**
 * 取某类型的全部分类（含已隐藏）
 * 管理页需要看到并恢复被隐藏的分类，因此这里带上 includeHidden。
 */
function collectCategories(type) {
  return store.listCategories(type, { includeHidden: true });
}

/** 本月各分类的流水笔数 */
function monthCounters(type) {
  const counter = new Map();
  store.listTransactions({ month: monthKey() }).forEach((tx) => {
    if (tx.type !== type) return;
    counter.set(tx.categoryId, (counter.get(tx.categoryId) || 0) + 1);
  });
  return counter;
}

/* ------------------------------------------------------------------ *
 * 顶部提示与分组
 * ------------------------------------------------------------------ */

function buildHint() {
  return h('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '8px',
      fontSize: '10.5px', color: 'var(--c-muted)',
      background: 'var(--c-surface)', border: '1px solid var(--c-line)',
      borderRadius: '14px', padding: '10px 14px',
    },
  }, [
    icon('ph:hand-grabbing', 'text-[14px]'),
    h('span', { style: { color: 'var(--c-brand)' } }, '长按分类行可拖拽调整顺序，拖动后自动保存'),
  ]);
}

function buildTabs() {
  const types = [
    { key: TX_TYPE.EXPENSE, label: '支出分类' },
    { key: TX_TYPE.INCOME, label: '收入分类' },
  ];

  return h('div.segment', { style: { display: 'flex', width: '100%', marginTop: '16px' } },
    types.map((item) => h('button.segment__item', {
      type: 'button',
      class: state.type === item.key ? 'is-active' : '',
      style: { flex: '1' },
      onclick: () => {
        state.type = item.key;
        render();
      },
    }, `${item.label}（${collectCategories(item.key).length}）`)));
}

function buildTip() {
  return h('section', {
    style: {
      marginTop: '12px',
      background: 'var(--c-brand-softer)',
      border: '1px solid var(--c-line)',
      borderRadius: '16px',
      padding: '12px 16px',
    },
  }, [
    h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '8px' } }, [
      icon('ph:info', 'text-[14px]'),
      h('p', {
        style: { fontSize: '10.5px', color: 'var(--c-ink-soft)', lineHeight: '1.7' },
      }, '删除分类后，已有流水会自动移入「其他」，不会丢失记录。预设分类不可删除，但可以修改名称与图标。'),
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 分类列表
 * ------------------------------------------------------------------ */

function buildPane() {
  const type = state.type;
  const categories = collectCategories(type);
  const counters = monthCounters(type);
  const presetCount = categories.filter((c) => c.isPreset).length;

  const meta = h('div.row-between', { style: { padding: '0 4px', marginBottom: '8px' } }, [
    h('p', { style: { fontSize: '11px', color: 'var(--c-muted)' } },
      `预设分类 ${presetCount} 个 · 自定义 ${categories.length - presetCount} 个`),
    h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)' } },
      `最多 ${RULES.MAX_CATEGORIES_PER_TYPE} 个`),
  ]);

  const card = h('div.card', { style: { overflow: 'hidden' } });

  if (!categories.length) {
    card.append(h('div.empty', {}, [
      h('div.empty__icon', {}, icon('ph:tag')),
      h('p.empty__title', {}, '还没有分类'),
      h('p.empty__desc', {}, '点击右上角「+」新增一个自定义分类'),
    ]));
  } else {
    categories.forEach((cat, index) => {
      const row = buildRow(cat, counters.get(cat.id) || 0, index, categories.length);
      bindDrag(row, card);
      card.append(row);
    });
  }

  listEl = card;
  return h('section', { style: { marginTop: '12px' } }, [meta, card]);
}

function buildRow(cat, count, index, total) {
  const row = h('div.list-row', {
    style: {
      padding: '12px 16px',
      borderBottom: index < total - 1 ? '1px solid var(--c-line-soft)' : 'none',
    },
    draggable: true,
    dataset: { id: cat.id },
  });

  row.append(
    h('div.list-row__icon', {
      style: { background: cat.color, width: '36px', height: '36px', fontSize: '17px' },
    }, cat.icon),
    h('div.flex-1', {}, [
      h('div.row.gap-2', {}, [
        h('span.list-row__title', {}, cat.name),
        cat.isPreset ? h('span.tag.tag--plain', {}, '预设') : h('span.tag', {}, '自定义'),
      ]),
      h('p.list-row__desc', {},
        cat.isHidden ? `本月 ${count} 笔流水 · 已隐藏` : `本月 ${count} 笔流水`),
    ]),
    buildRoundButton('ph:pencil-simple', `编辑${cat.name}`, 'var(--c-ink-soft)', 'var(--c-bg)',
      () => openEditor(cat)),
    buildRoundButton('ph:trash', `删除${cat.name}`,
      cat.isPreset ? 'var(--c-faint)' : 'var(--c-expense)',
      cat.isPreset ? 'var(--c-surface)' : 'var(--c-bg)',
      () => handleDelete(cat)),
    buildDragHandle(cat),
  );

  return row;
}

function buildRoundButton(iconName, label, color, background, onClick) {
  return h('button', {
    type: 'button',
    'aria-label': label,
    style: {
      width: '28px', height: '28px', borderRadius: '999px',
      background, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: '0',
    },
    onclick: onClick,
  }, icon(iconName, 'text-[13px]'));
}

function buildDragHandle(cat) {
  return h('button', {
    type: 'button',
    draggable: false,
    'aria-label': `${cat.name}排序与更多操作`,
    style: {
      width: '20px', flexShrink: '0', cursor: 'grab',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--c-faint)',
    },
    onclick: () => openRowMenu(cat),
  }, icon('ph:dots-six-vertical', 'text-[15px]'));
}

/* ------------------------------------------------------------------ *
 * 拖拽排序
 * ------------------------------------------------------------------ */

function bindDrag(row, container) {
  row.addEventListener('dragstart', (e) => {
    dragRow = row;
    row.style.opacity = '0.45';
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('text/plain', row.dataset.id || '');
      } catch (err) {
        /* 部分环境不允许写入，忽略即可 */
      }
    }
  });

  row.addEventListener('dragend', () => {
    row.style.opacity = '';
    dragRow = null;
    persistOrder(container);
  });

  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragRow || dragRow === row) return;
    const rect = row.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    container.insertBefore(dragRow, after ? row.nextSibling : row);
  });

  row.addEventListener('drop', (e) => e.preventDefault());
}

/** 拖拽结束后按 DOM 顺序写回 store */
function persistOrder(container) {
  const ids = Array.from(container.children)
    .map((el) => el.dataset && el.dataset.id)
    .filter(Boolean);
  if (!ids.length) return;
  store.reorderCategories(state.type, ids);
  showToast('顺序已保存');
}

/** 上移 / 下移一位（触屏设备无法拖拽时的补充手段） */
function moveCategory(index, delta) {
  const list = collectCategories(state.type);
  const target = index + delta;
  if (target < 0 || target >= list.length) {
    showToast(delta < 0 ? '已经在最上面了' : '已经在最下面了');
    return;
  }
  const next = list.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  store.reorderCategories(state.type, next.map((c) => c.id));
  render();
  showToast(`「${item.name}」已移到第 ${target + 1} 位`);
}

/* ------------------------------------------------------------------ *
 * 行内操作
 * ------------------------------------------------------------------ */

async function openRowMenu(cat) {
  const index = collectCategories(state.type).findIndex((c) => c.id === cat.id);
  const picked = await actionSheet(cat.name, [
    { label: '上移一位', value: 'up' },
    { label: '下移一位', value: 'down' },
    { label: '编辑分类', value: 'edit' },
    { label: '删除分类', value: 'delete', danger: true },
  ]);

  if (!picked) return;
  if (picked === 'edit') {
    openEditor(cat);
  } else if (picked === 'delete') {
    handleDelete(cat);
  } else {
    moveCategory(index, picked === 'up' ? -1 : 1);
  }
}

async function handleDelete(cat) {
  const check = store.checkCategoryDeletable(cat.id);

  // R1：预设分类不可删除
  if (!check.ok) {
    showToast(check.reason === 'preset' ? '预设分类不可删除，可修改名称' : '分类不存在');
    return;
  }

  // R2：分类下已有流水时先做二次确认
  if (check.affected > 0) {
    const confirmed = await confirmDialog({
      title: `删除分类「${cat.name}」？`,
      message: `该分类下已有 ${check.affected} 笔流水，删除后将归入「其他」分类。`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger',
    });
    if (!confirmed) return;
  }

  const result = store.deleteCategory(cat.id);
  if (!result.ok) {
    showToast(result.message || '删除失败');
    return;
  }
  showToast(`已删除分类「${cat.name}」`);
  render();
}

/* ------------------------------------------------------------------ *
 * 新增 / 编辑分类弹层
 * ------------------------------------------------------------------ */

function openEditor(category) {
  const draft = {
    id: category ? category.id : null,
    type: category ? category.type : state.type,
    name: category ? category.name : '',
    icon: category ? category.icon : ICON_PALETTE[0],
    color: category ? category.color : COLOR_PALETTE[0],
    isHidden: category ? Boolean(category.isHidden) : false,
  };
  createOverlay((close) => buildEditorSheet(draft, close));
}

function applyIconState(btn, on) {
  btn.style.boxShadow = on ? '0 0 0 2px var(--c-brand)' : 'none';
  btn.style.borderColor = on ? 'var(--c-brand)' : 'transparent';
}

function applyColorState(btn, on) {
  btn.style.borderColor = on ? 'var(--c-brand)' : 'transparent';
}

function buildEditorSheet(draft, close) {
  const nameInput = h('input.input', {
    type: 'text',
    value: draft.name,
    maxlength: RULES.MAX_CATEGORY_NAME_LENGTH,
    placeholder: '例如：宠物',
    style: { flex: '1', minWidth: '0' },
  });

  const preview = h('span', { style: { fontSize: '16px', flexShrink: '0' } }, draft.icon);

  const iconButtons = ICON_PALETTE.map((ic) => {
    const btn = h('button', {
      type: 'button',
      dataset: { icon: ic },
      style: {
        width: '36px', height: '36px', borderRadius: '11px', background: 'var(--c-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', border: '1px solid transparent',
      },
      onclick: () => {
        draft.icon = ic;
        preview.textContent = ic;
        iconButtons.forEach((b) => applyIconState(b, b.dataset.icon === ic));
      },
    }, ic);
    applyIconState(btn, ic === draft.icon);
    return btn;
  });

  const colorButtons = COLOR_PALETTE.map((color) => {
    const btn = h('button', {
      type: 'button',
      dataset: { color },
      style: {
        width: '32px', height: '32px', borderRadius: '999px', background: color,
        border: '2px solid transparent', flexShrink: '0',
      },
      onclick: () => {
        draft.color = color;
        colorButtons.forEach((b) => applyColorState(b, b.dataset.color === color));
      },
    });
    applyColorState(btn, color === draft.color);
    return btn;
  });

  const hiddenSwitch = h('div.switch', {
    class: draft.isHidden ? 'is-on' : '',
    role: 'switch',
    tabindex: '0',
  }, h('div.switch__knob'));

  hiddenSwitch.addEventListener('click', () => {
    draft.isHidden = !draft.isHidden;
    hiddenSwitch.classList.toggle('is-on', draft.isHidden);
  });

  return h('div', { style: { padding: '0 20px 20px' } }, [
    h('div.row-between', {}, [
      h('h2', { style: { fontSize: '15px', fontWeight: '600' } },
        draft.id ? `编辑分类 · ${draft.name}` : '新增分类'),
      h('button', {
        type: 'button',
        'aria-label': '关闭',
        style: {
          width: '32px', height: '32px', borderRadius: '999px', background: 'var(--c-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-ink-soft)',
        },
        onclick: close,
      }, icon('ph:x', 'text-[15px]')),
    ]),

    h('div.field', { style: { marginTop: '16px' } }, [
      h('span.field__label', {}, '分类名称'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
        preview,
        nameInput,
        h('span', { style: { fontSize: '10px', color: 'var(--c-faint)', flexShrink: '0' } },
          `最多 ${RULES.MAX_CATEGORY_NAME_LENGTH} 字`),
      ]),
    ]),

    h('div.field', { style: { marginTop: '12px' } }, [
      h('span.field__label', {}, '选择图标'),
      h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px' },
      }, iconButtons),
    ]),

    h('div.field', { style: { marginTop: '12px' } }, [
      h('span.field__label', {}, '分类底色'),
      h('div', { style: { display: 'flex', gap: '8px' } }, colorButtons),
    ]),

    draft.id ? h('div.row-between', {
      style: {
        marginTop: '16px', padding: '12px 0',
        borderTop: '1px solid var(--c-line-soft)',
      },
    }, [
      h('div', {}, [
        h('p', { style: { fontSize: '13px' } }, '在记账面板中隐藏'),
        h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)', marginTop: '2px' } },
          '隐藏后记账时不再出现该分类，可在分类管理中恢复'),
      ]),
      hiddenSwitch,
    ]) : null,

    h('button.btn.btn--primary.btn--block', {
      type: 'button',
      style: { marginTop: '20px' },
      onclick: () => saveDraft(draft, nameInput, close),
    }, '保存分类'),
  ]);
}

function saveDraft(draft, nameInput, close) {
  const name = nameInput.value.trim();
  if (!name) {
    showToast('请输入分类名称');
    nameInput.focus();
    return;
  }

  if (draft.id) {
    const result = store.updateCategory(draft.id, {
      name,
      icon: draft.icon,
      color: draft.color,
      isHidden: draft.isHidden,
    });
    if (!result.ok) {
      showToast(result.message || '保存失败');
      return;
    }
    showToast(`已保存「${name}」`);
  } else {
    const result = store.addCategory({
      name,
      type: draft.type,
      icon: draft.icon,
      color: draft.color,
    });
    if (!result.ok) {
      showToast(result.message || '新增失败');
      return;
    }
    showToast(`已新增分类「${name}」`);
  }

  close();
  render();
}

/* ------------------------------------------------------------------ *
 * 渲染与初始化
 * ------------------------------------------------------------------ */

function render() {
  clear(bodyRef);
  bodyRef.append(buildHint(), buildTabs(), buildPane(), buildTip());
}

function openAdd() {
  // R3：每种类型独立上限
  if (collectCategories(state.type).length >= RULES.MAX_CATEGORIES_PER_TYPE) {
    showToast(`每种类型最多 ${RULES.MAX_CATEGORIES_PER_TYPE} 个分类`);
    return;
  }
  openEditor(null);
}

function init() {
  const page = createPage({
    title: '分类管理',
    back: ROUTES.settings,
    action: h('button.app-header__action', {
      type: 'button',
      'aria-label': '新增分类',
      style: { background: 'var(--c-brand)', color: 'var(--c-on-brand)', border: 'none' },
      onclick: openAdd,
    }, icon('ph:plus', 'text-[17px]')),
  });
    // 未登录时已被重定向到登录页
    if (!page) return;

  bodyRef = h('div', {});
  page.body.append(bodyRef);

  render();
}

init();
