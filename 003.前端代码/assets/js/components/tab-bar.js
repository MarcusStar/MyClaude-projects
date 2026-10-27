/**
 * 底部导航（PRD 7.1）
 * ------------------------------------------------------------------
 * 三个主 Tab：明细 / 统计 / 设置
 */

import { h, icon } from '../core/dom.js';
import { TABS } from '../core/constants.js';

/**
 * @param {string} activeKey 当前激活的 Tab key
 * @returns {HTMLElement}
 */
export function createTabBar(activeKey) {
  return h('nav.tabbar', { 'aria-label': '主导航' }, TABS.map((tab) =>
    h('a.tabbar__item', {
      href: tab.href,
      class: tab.key === activeKey ? 'is-active' : '',
      'aria-current': tab.key === activeKey ? 'page' : null,
    }, [
      icon(tab.icon),
      h('span', {}, tab.label),
    ])
  ));
}
