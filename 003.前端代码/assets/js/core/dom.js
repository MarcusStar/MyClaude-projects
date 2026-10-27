/**
 * DOM 工具
 * ------------------------------------------------------------------
 * 极简 hyperscript，避免每个页面重复写 innerHTML 字符串拼接。
 */

/**
 * 创建元素
 * @param {string} tag  标签名，支持 div.class#id 语法
 * @param {object} [props] 属性；class / style / dataset / on* 事件均可
 * @param {(Node|string|null|undefined|false)[]} [children]
 */
export function h(tag, props = {}, children = []) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');

  rest.forEach((token) => {
    if (token[0] === '.') el.classList.add(token.slice(1));
    else if (token[0] === '#') el.id = token.slice(1);
  });

  Object.entries(props || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class' || key === 'className') {
      String(value).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.entries(value).forEach(([k, v]) => {
        if (v !== null && v !== undefined) el.dataset[k] = v;
      });
    } else if (key === 'html') {
      el.innerHTML = value;
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in el && key !== 'list' && typeof value !== 'object') {
      try {
        el[key] = value;
      } catch {
        el.setAttribute(key, value);
      }
    } else {
      el.setAttribute(key, value);
    }
  });

  const list = Array.isArray(children) ? children : [children];
  list.forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });

  return el;
}

/** 查询单个元素 */
export const $ = (selector, scope = document) => scope.querySelector(selector);
/** 查询多个元素 */
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

/** 清空容器 */
export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** 挂载子节点 */
export function mount(node, children = []) {
  const list = Array.isArray(children) ? children : [children];
  list.forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

/** 创建带图标的元素（iconify-icon） */
export function icon(name, className = '') {
  const el = document.createElement('iconify-icon');
  el.setAttribute('icon', name);
  if (className) el.className = className;
  return el;
}

/**
 * 获取弹层挂载容器
 * ------------------------------------------------------------------
 * 弹层必须挂到 .app-frame 内部，否则在宽屏下会撑满整个视口，
 * 而不是在手机画板内展示。
 */
export function getOverlayHost() {
  return (
    document.querySelector('.app-frame') ||
    document.getElementById('app') ||
    document.body
  );
}

/** 页面内跳转（统一走这里，便于集中埋点） */
export function go(path, params) {
  const query = params ? `?${new URLSearchParams(params)}` : '';
  window.location.href = `${path}${query}`;
}
