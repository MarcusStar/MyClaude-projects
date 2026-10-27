/**
 * 流水行（可复用）
 * ------------------------------------------------------------------
 * 首页、搜索结果、分类明细页共用同一套行样式，避免视觉漂移。
 */

import { h } from '../core/dom.js';
import { TX_TYPE } from '../core/constants.js';
import { formatSignedMoney, timeKey } from '../core/format.js';

/**
 * @param {object} tx 流水对象（需带 category 字段）
 * @param {object} [options]
 * @param {string} [options.href]      跳转地址
 * @param {Function} [options.onClick] 点击回调（优先于 href）
 * @param {boolean} [options.showTime] 是否显示时间（默认显示）
 * @param {boolean} [options.showCategory] 是否显示分类名（默认显示）
 * @returns {HTMLElement}
 */
export function createTransactionItem(tx, options = {}) {
  const { href, onClick, showTime = true, showCategory = true } = options;
  const category = tx.category || { name: '未分类', icon: '📦', color: '#F1F3F4' };
  const isIncome = tx.type === TX_TYPE.INCOME;

  const row = h(href ? 'a' : 'div', {
    class: 'tx-row flex items-center gap-3 px-4 py-3.5',
    href,
    onclick: onClick,
  }, [
    h('div', {
      class: 'icon-badge',
      style: { background: category.color },
    }, category.icon),
    h('div.flex-1', { style: { minWidth: '0' } }, [
      h('p', {
        style: { fontSize: '14px', fontWeight: '500', lineHeight: '1.25' },
      }, showCategory ? category.name : (tx.note || category.name)),
      tx.note ? h('p.mt-1.truncate', {
        style: { fontSize: '11px', color: 'var(--c-muted)' },
      }, tx.note) : null,
    ]),
    h('div', { style: { textAlign: 'right', flexShrink: '0' } }, [
      h('p.num', {
        style: {
          fontSize: '15px',
          fontWeight: '600',
          color: isIncome ? 'var(--c-income)' : 'var(--c-ink)',
        },
      }, formatSignedMoney(tx.amount, tx.type)),
      showTime ? h('p.mt-0.5', {
        style: { fontSize: '10px', color: 'var(--c-faint)' },
      }, timeKey(tx.occurredAt)) : null,
    ]),
  ]);

  return row;
}

/** 流水行之间的分隔线 */
export function createDivider() {
  return h('div.list-divider');
}
