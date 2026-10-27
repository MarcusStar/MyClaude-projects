/**
 * 页面外壳（App Shell）
 * ------------------------------------------------------------------
 * 统一负责：顶栏、内容区、底部导航、悬浮记账按钮。
 * 页面模块只关心内容，通过 page.body 挂载。
 */

import { h, icon, go } from '../core/dom.js';
import { createTabBar } from './tab-bar.js';
import { showToast } from '../core/toast.js';
import { auth } from '../core/auth.js';

/**
 * 创建页面外壳
 * @param {object} options
 * @param {string} options.title        顶栏标题
 * @param {string} [options.subtitle]   顶栏副标题
 * @param {string} [options.back]       返回目标页面；不传则不显示返回按钮
 * @param {string} [options.tab]        底部导航激活项 key
 * @param {HTMLElement} [options.action] 顶栏右侧操作按钮
 * @param {boolean} [options.fab]       是否显示悬浮记账按钮
 * @param {() => HTMLElement} [options.header] 自定义顶栏；返回整段顶栏节点
 * @param {boolean} [options.public]    公开页面（登录页等），跳过登录门禁
 * @returns {{frame:HTMLElement, body:HTMLElement, header:HTMLElement, setTitle:Function, showToast:Function}|null}
 *          未登录时会被重定向到登录页，此时返回 null，调用方需 `if (!page) return;`
 */
export function createPage(options = {}) {
  const {
    title = '',
    subtitle = '',
    back,
    tab,
    action,
    fab = false,
    header: customHeader,
    public: isPublic = false,
  } = options;

  // 门禁：未登录一律跳转到登录页
  if (!isPublic && !auth.isLoggedIn()) {
    auth.redirectToLogin();
    return null;
  }

  const titleBlock = h('div.flex-1', {}, [
    h('h1.app-header__title', {}, title),
    subtitle ? h('p.app-header__subtitle.mt-1', {}, subtitle) : null,
  ]);

  const header = customHeader
    ? customHeader()
    : h('header.app-header', {}, [
        h('div.row', { style: { gap: '12px' } }, [
          back
            ? h('a.app-header__back', {
                href: back,
                'aria-label': '返回',
                onclick: () => {
                  // 有历史记录时优先后退，保持返回栈语义
                  if (window.history.length > 1) {
                    event.preventDefault();
                    window.history.back();
                  }
                },
              }, icon('ph:caret-left'))
            : null,
          titleBlock,
          action || null,
        ]),
      ]);

  const body = h('main.app-body.scroll-area', {
    class: tab ? 'has-tabbar' : '',
  });

  const frame = h('div.app-frame', {}, [header, body]);

  if (tab) frame.append(createTabBar(tab));

  if (fab) {
    frame.append(h('button.fab', {
      type: 'button',
      'aria-label': '记一笔',
      onclick: () => {
        // 动态引入，避免所有页面都加载记账面板代码
        import('./record-sheet.js').then(({ openRecordSheet }) => {
          openRecordSheet({ onSaved: () => window.location.reload() });
        });
      },
    }, icon('ph:plus')));
  }

  const host = document.getElementById('app') || document.body;
  host.append(frame);

  return {
    frame,
    header,
    body,
    setTitle(next) {
      const titleEl = header.querySelector('.app-header__title');
      if (titleEl) titleEl.textContent = next;
    },
    showToast,
    go,
  };
}
