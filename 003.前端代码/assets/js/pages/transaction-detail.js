/**
 * 页面：流水详情 —— PRD P-03 / FR-05
 * ------------------------------------------------------------------
 * 单笔账目的完整信息：大额金额、分类图标与名称、备注、发生时间、创建/更新时间。
 * 底部提供「编辑」（复用记账面板回填，PRD FR-05）与「删除」（二次确认，PRD FR-03 R1）。
 */

import { h, icon, clear } from '../core/dom.js';
import { createPage } from '../components/shell.js';
import { confirmDialog } from '../components/dialog.js';
import { openRecordSheet } from '../components/record-sheet.js';
import { store } from '../core/store.js';
import { ROUTES, TX_TYPE } from '../core/constants.js';
import { formatSignedMoney, formatMonthDay, formatDateTime, weekday, timeKey } from '../core/format.js';

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

/** 从 URL 上读取流水 id */
function readId() {
  return new URLSearchParams(window.location.search).get('id');
}

/* ------------------------------------------------------------------ *
 * 顶部金额卡
 * ------------------------------------------------------------------ */

function buildHero(tx) {
  const category = tx.category || { name: '未分类', icon: '📦', color: 'var(--c-line-soft)' };
  const isIncome = tx.type === TX_TYPE.INCOME;

  return h('section.card', {
    style: { padding: 'var(--s-6) var(--s-5) var(--s-5)', textAlign: 'center' },
  }, [
    h('span.tag', { style: { height: '20px', padding: '0 8px' } }, isIncome ? '收入' : '支出'),
    h('p.num', {
      style: {
        fontSize: 'var(--fs-3xl)',
        fontWeight: '600',
        lineHeight: '1.1',
        marginTop: 'var(--s-3)',
        color: isIncome ? 'var(--c-income)' : 'var(--c-ink)',
      },
    }, formatSignedMoney(tx.amount, tx.type)),
    h('div.row.gap-2', {
      style: { justifyContent: 'center', marginTop: 'var(--s-4)' },
    }, [
      h('div.icon-badge', {
        style: { background: category.color, width: '44px', height: '44px', fontSize: '22px' },
      }, category.icon),
      h('div', { style: { textAlign: 'left' } }, [
        h('p', { style: { fontSize: 'var(--fs-md)', fontWeight: '500' } }, category.name),
        h('p', { style: { fontSize: 'var(--fs-2xs)', color: 'var(--c-muted)' } },
          `${formatMonthDay(tx.occurredAt)} ${weekday(tx.occurredAt)} ${timeKey(tx.occurredAt)}`),
      ]),
    ]),
    tx.note
      ? h('p', {
        style: {
          fontSize: 'var(--fs-sm)',
          color: 'var(--c-ink-soft)',
          marginTop: 'var(--s-4)',
          paddingTop: 'var(--s-4)',
          borderTop: '1px solid var(--c-line-soft)',
        },
      }, tx.note)
      : null,
  ]);
}

/* ------------------------------------------------------------------ *
 * 信息卡
 * ------------------------------------------------------------------ */

function infoRow(label, value, last = false) {
  return h('div.list-row', {
    style: {
      justifyContent: 'space-between',
      padding: 'var(--s-3) var(--s-4)',
      borderBottom: last ? 'none' : '1px solid var(--c-line-soft)',
    },
  }, [
    h('span', { style: { fontSize: 'var(--fs-sm)', color: 'var(--c-muted)' } }, label),
    h('span', {
      style: {
        fontSize: 'var(--fs-md)',
        color: 'var(--c-ink)',
        fontWeight: '500',
        textAlign: 'right',
      },
    }, value),
  ]);
}

function buildInfoCard(tx) {
  const category = tx.category || { name: '未分类', icon: '📦' };
  return h('section.card', {
    style: { marginTop: 'var(--s-3)', overflow: 'hidden' },
  }, [
    infoRow('分类', `${category.icon} ${category.name}`),
    infoRow('发生时间', `${formatMonthDay(tx.occurredAt)} ${weekday(tx.occurredAt)} ${timeKey(tx.occurredAt)}`),
    infoRow('创建时间', formatDateTime(tx.createdAt)),
    infoRow('更新时间', formatDateTime(tx.updatedAt), true),
  ]);
}

/* ------------------------------------------------------------------ *
 * 空状态
 * ------------------------------------------------------------------ */

function buildEmpty() {
  return h('div.empty', {}, [
    h('div.empty__icon', {}, icon('ph:receipt', 'text-[28px]')),
    h('p.empty__title', {}, '没有找到这笔账目'),
    h('p.empty__desc', {}, '它可能已被删除，去首页看看其它流水吧'),
    h('a.btn.btn--primary', { href: ROUTES.home, style: { marginTop: 'var(--s-2)' } }, '返回首页'),
  ]);
}

/* ------------------------------------------------------------------ *
 * 交互
 * ------------------------------------------------------------------ */

/** 编辑：复用记账面板并回填原数据（PRD FR-05） */
function handleEdit(tx) {
  openRecordSheet({
    transaction: tx,
    onSaved: () => render(),
  });
}

/** 删除：二次确认后软删除并返回首页（PRD FR-03 R1） */
async function handleDelete(tx) {
  const confirmed = await confirmDialog({
    title: '删除这笔账目？',
    message: '删除后不可恢复，确认删除这笔账目吗？',
    confirmText: '删除',
    variant: 'danger',
  });
  if (!confirmed) return;

  const result = store.deleteTransaction(tx.id);
  if (!result.ok) {
    page.showToast('删除失败');
    return;
  }
  page.showToast('已删除');
  setTimeout(() => {
    window.location.href = ROUTES.home;
  }, 600);
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

let page = null;
let bodyRef = null;
let actionRef = null;

function render() {
  clear(bodyRef);

  const id = readId();
  const tx = id ? store.getTransaction(id) : null;

  if (!tx) {
    actionRef.classList.add('hidden');
    bodyRef.append(buildEmpty());
    return;
  }

  actionRef.classList.remove('hidden');
  bodyRef.append(buildHero(tx), buildInfoCard(tx));
}

/** 底部操作条 */
function buildActionBar() {
  const action = h('div', {
    style: {
      flexShrink: '0',
      display: 'flex',
      gap: 'var(--s-3)',
      padding: 'var(--s-3) var(--s-5)',
      background: 'var(--c-surface)',
      borderTop: '1px solid var(--c-line)',
    },
  }, [
    h('button.btn.btn--ghost.flex-1', {
      type: 'button',
      onclick: () => {
        const tx = store.getTransaction(readId());
        if (tx) handleEdit(tx);
      },
    }, [icon('ph:pencil-simple', 'text-[16px]'), '编辑']),
    h('button.btn.btn--danger.flex-1', {
      type: 'button',
      onclick: () => {
        const tx = store.getTransaction(readId());
        if (tx) handleDelete(tx);
      },
    }, [icon('ph:trash', 'text-[16px]'), '删除']),
  ]);

  return action;
}

function init() {
  page = createPage({
    title: '流水详情',
    back: ROUTES.home,
  });
    // 未登录时已被重定向到登录页
    if (!page) return;

  bodyRef = h('div', { style: { paddingBottom: 'var(--s-4)' } });
  page.body.append(bodyRef);

  actionRef = buildActionBar();
  page.frame.append(actionRef);

  render();
}

init();
