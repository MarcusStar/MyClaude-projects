/**
 * 页面：导出记录 —— PRD FR-09 配套页
 * ------------------------------------------------------------------
 * 展示本地保存的导出历史（文件名 / 时间范围 / 行数 / 大小 / 导出时间），
 * 支持「再次分享」与二次确认后的「清空记录」。
 */

import { h, icon, clear } from '../core/dom.js';
import { createPage } from '../components/shell.js';
import { confirmDialog } from '../components/dialog.js';
import { showToast } from '../core/toast.js';
import { store } from '../core/store.js';
import { ROUTES } from '../core/constants.js';

/* ------------------------------------------------------------------ *
 * 展示辅助
 * ------------------------------------------------------------------ */

/** 2026-10-24 21:40 → 10月24日 21:40 */
function formatExportedAt(value) {
  const text = String(value || '').trim();
  if (!text) return '未知时间';
  const [datePart, timePart = ''] = text.split(' ');
  const parts = datePart.split('-');
  if (parts.length < 3) return text;
  const [, m, d] = parts;
  return `${Number(m)}月${Number(d)}日 ${timePart.slice(0, 5)}`.trim();
}

/** 一条记录的完整描述：范围 · 行数 · 大小 */
function describeRecord(record) {
  const parts = [];
  if (record.range) parts.push(record.range);
  if (record.rangeDetail && record.rangeDetail !== record.range) parts.push(record.rangeDetail);
  if (typeof record.rows === 'number') parts.push(`${record.rows} 笔`);
  if (record.size) parts.push(record.size);
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ *
 * 区块
 * ------------------------------------------------------------------ */

/** 顶部概览卡 */
function buildSummaryCard(records) {
  const latest = records[0];

  return h('section.card', {
    style: { padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' },
  }, [
    h('div', {
      style: {
        width: '40px', height: '40px', borderRadius: '13px',
        background: 'var(--c-brand-soft)', color: 'var(--c-brand)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '19px', flexShrink: 0,
      },
    }, icon('ph:files')),
    h('div', { style: { flex: '1', minWidth: 0 } }, [
      h('p', { style: { fontSize: '13px', fontWeight: '500' } }, `共导出 ${records.length} 次`),
      h('p', {
        style: { fontSize: '10.5px', color: 'var(--c-muted)', marginTop: '2px' },
      }, latest
        ? `最近一次：${formatExportedAt(latest.exportedAt)} · ${latest.rows ?? 0} 笔`
        : '还没有导出过，去「数据导出」生成第一份 CSV 吧'),
    ]),
    h('a', {
      href: ROUTES.exportData,
      style: {
        fontSize: '10.5px', color: 'var(--c-brand)', flexShrink: 0,
        border: '1px solid color-mix(in srgb, var(--c-brand) 22%, var(--c-surface))',
        borderRadius: '999px', padding: '4px 10px',
      },
    }, '新建导出'),
  ]);
}

/** 空状态 */
function buildEmpty() {
  return h('div.card', {}, [
    h('div.empty', {}, [
      h('div.empty__icon', {}, '🗂️'),
      h('p.empty__title', { style: { fontSize: '12px' } }, '还没有导出记录'),
      h('p.empty__desc', {}, '导出后文件会显示在这里'),
    ]),
  ]);
}

/** 单条记录 */
function buildRecordRow(record, index, total) {
  return h('div.list-row', {
    style: index < total - 1 ? { borderBottom: '1px solid var(--c-line-soft)' } : {},
  }, [
    h('div.list-row__icon', {
      style: { background: 'var(--c-brand-soft)', color: 'var(--c-brand)', fontSize: '16px' },
    }, icon('ph:file-csv')),
    h('div', { style: { flex: '1', minWidth: 0 } }, [
      h('p.num.truncate', { style: { fontSize: '11.5px', fontWeight: '500' } },
        record.fileName || '未命名文件'),
      h('p', { style: { fontSize: '10px', color: 'var(--c-muted)', marginTop: '2px' } },
        `${describeRecord(record)} · ${formatExportedAt(record.exportedAt)}`),
    ]),
    h('button', {
      type: 'button',
      style: {
        flexShrink: 0, fontSize: '10.5px', color: 'var(--c-brand)',
        border: '1px solid color-mix(in srgb, var(--c-brand) 22%, var(--c-surface))',
        borderRadius: '999px', padding: '4px 10px',
      },
      onclick: () => resend(record),
    }, '再次分享'),
  ]);
}

/** 列表 */
function buildList(records) {
  if (!records.length) return buildEmpty();
  return h('div.card', { style: { overflow: 'hidden' } },
    records.map((record, index) => buildRecordRow(record, index, records.length)));
}

/** 底部提示 */
function buildTip() {
  return h('div', {
    style: {
      marginTop: '12px', borderRadius: '16px', background: 'var(--c-bg)',
      padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '8px',
    },
  }, [
    icon('ph:info', 'text-[13px]'),
    h('p', { style: { fontSize: '10px', color: 'var(--c-muted)', lineHeight: '1.6' } },
      '导出的文件只保存在本机，记录中不包含文件内容。删除记录不会删除已分享出去的文件。'),
  ]);
}

/* ------------------------------------------------------------------ *
 * 动作
 * ------------------------------------------------------------------ */

/** 再次分享（PRD FR-09 R3） */
function resend(record) {
  showToast(`已重新生成「${record.fileName || '导出文件'}」`);
}

/** 清空记录：二次确认后执行（PRD FR-03 R1 同款交互） */
async function requestClear() {
  const ok = await confirmDialog({
    title: '清空导出记录？',
    message: '清空后不可恢复。已导出到本机的文件不会被删除。',
    confirmText: '清空',
    variant: 'danger',
  });
  if (!ok) return;
  store.clearExportHistory();
  render();
  showToast('导出记录已清空');
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

let bodyRef = null;

function render() {
  const records = store.listExportHistory();
  clear(bodyRef);
  bodyRef.append(
    buildSummaryCard(records),
    h('h2', {
      style: {
        fontSize: '12px', fontWeight: '600', color: 'var(--c-ink)',
        paddingLeft: '4px', marginTop: '16px', marginBottom: '8px',
      },
    }, '历史文件'),
    buildList(records),
    buildTip(),
  );
}

function init() {
  const action = h('button', {
    type: 'button',
    style: { fontSize: '11px', color: 'var(--c-muted)' },
    onclick: requestClear,
  }, '清空');

  const page = createPage({
    title: '导出记录',
    back: ROUTES.exportData,
    action,
  });
    // 未登录时已被重定向到登录页
    if (!page) return;

  bodyRef = h('div', {});
  page.body.append(bodyRef);
  page.body.style.paddingBottom = '24px';

  page.frame.append(h('div', {
    style: {
      flexShrink: 0, background: 'var(--c-surface)',
      borderTop: '1px solid var(--c-line)', padding: '12px 20px',
    },
  }, h('a', {
    href: ROUTES.exportData,
    class: 'btn btn--primary btn--block',
    style: { fontSize: '13px' },
  }, '导出新的 CSV 文件')));

  render();
}

init();
