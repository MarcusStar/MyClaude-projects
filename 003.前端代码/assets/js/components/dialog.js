/**
 * 通用弹窗（Modal / Confirm）
 * ------------------------------------------------------------------
 * PRD FR-03 R1：删除流水需要二次确认。
 */

import { h, getOverlayHost } from '../core/dom.js';

/**
 * 弹出确认框
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} [options.confirmText]
 * @param {string} [options.cancelText]
 * @param {'default'|'danger'} [options.variant]
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title,
  message = '',
  confirmText = '确认',
  cancelText = '取消',
  variant = 'default',
}) {
  return new Promise((resolve) => {
    const backdrop = h('div.backdrop');
    const modal = h('div.modal', {}, [
      h('div', { style: { padding: '22px 20px 16px' } }, [
        h('p', { class: 'font-semibold', style: { fontSize: '16px' } }, title),
        message
          ? h('p.mt-2', {
              class: 'text-muted',
              style: { fontSize: '12.5px', lineHeight: '1.6' },
            }, message)
          : null,
      ]),
      h('div', {
        style: {
          display: 'flex',
          borderTop: '1px solid var(--c-line)',
        },
      }, [
        h('button', {
          class: 'flex-1',
          style: { padding: '14px 0', fontSize: '14px', color: 'var(--c-ink-soft)' },
          type: 'button',
          onclick: () => close(false),
        }, cancelText),
        h('button', {
          class: 'flex-1',
          style: {
            padding: '14px 0',
            fontSize: '14px',
            fontWeight: '600',
            color: variant === 'danger' ? 'var(--c-expense)' : 'var(--c-brand)',
            borderLeft: '1px solid var(--c-line)',
          },
          type: 'button',
          onclick: () => close(true),
        }, confirmText),
      ]),
    ]);

    const host = getOverlayHost();
    host.append(backdrop, modal);

    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      modal.classList.add('is-open');
    });

    function close(result) {
      backdrop.classList.remove('is-open');
      modal.classList.remove('is-open');
      setTimeout(() => {
        backdrop.remove();
        modal.remove();
      }, 200);
      resolve(result);
    }

    backdrop.addEventListener('click', () => close(false));
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        close(false);
      }
    });
  });
}

/**
 * 弹出信息弹窗（仅一个确认按钮）
 */
export function alertDialog({ title, message = '', confirmText = '知道了' }) {
  return confirmDialog({ title, message, confirmText, cancelText: '关闭' });
}

/**
 * 底部操作列表（Action Sheet）
 * @param {string} title
 * @param {{label:string, value:any, danger?:boolean}[]} actions
 * @returns {Promise<any>}
 */
export function actionSheet(title, actions) {
  return new Promise((resolve) => {
    const backdrop = h('div.backdrop');
    const sheet = h('div.sheet', { style: { maxHeight: '60%' } }, [
      h('div.sheet__grip'),
      h('p', {
        class: 'text-center text-muted',
        style: { fontSize: '12px', padding: '4px 20px 12px' },
      }, title),
      h('div', { style: { overflowY: 'auto' } }, actions.map((action) =>
        h('button', {
          class: 'flex items-center justify-center w-full',
          style: {
            padding: '15px 0',
            fontSize: '15px',
            borderTop: '1px solid var(--c-line-soft)',
            color: action.danger ? 'var(--c-expense)' : 'var(--c-ink)',
          },
          type: 'button',
          onclick: () => close(action.value),
        }, action.label)
      )),
    ]);

    const host = getOverlayHost();
    host.append(backdrop, sheet);

    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      sheet.classList.add('is-open');
    });

    function close(value) {
      backdrop.classList.remove('is-open');
      sheet.classList.remove('is-open');
      setTimeout(() => {
        backdrop.remove();
        sheet.remove();
      }, 280);
      resolve(value);
    }

    backdrop.addEventListener('click', () => close(undefined));
  });
}

/** 通用弹层容器：返回 close() 以手动控制显隐 */
export function createOverlay(buildContent) {
  const backdrop = h('div.backdrop');
  const sheet = h('div.sheet');
  const host = getOverlayHost();

  const close = () => {
    backdrop.classList.remove('is-open');
    sheet.classList.remove('is-open');
    setTimeout(() => {
      backdrop.remove();
      sheet.remove();
    }, 280);
  };

  const content = buildContent(close);
  sheet.append(h('div.sheet__grip'), content);
  host.append(backdrop, sheet);

  backdrop.addEventListener('click', close);
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    sheet.classList.add('is-open');
  });

  return { close, sheet, backdrop };
}
