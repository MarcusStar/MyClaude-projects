/**
 * 页面：设置 —— PRD P-09 / FR-09 / FR-10
 * ------------------------------------------------------------------
 * 全局设置与各模块入口：账号、预算、分类管理、数据导出与导出记录、记账提醒、
 * 外观（深色模式开关）与关于（隐私政策 / 清除全部数据）。
 * 账目状态读写走 core/store.js，账号状态读写走 core/auth.js。
 */

import { h, icon, clear } from '../core/dom.js';
import { createPage } from '../components/shell.js';
import { alertDialog, confirmDialog, createOverlay } from '../components/dialog.js';
import { showToast } from '../core/toast.js';
import { store } from '../core/store.js';
import { auth } from '../core/auth.js';
import { ROUTES, AUTH_RULES } from '../core/constants.js';
import { formatAmount, monthKey, toDate } from '../core/format.js';

const APP_VERSION = 'v1.0';

let bodyRef = null;
let themeSwitchRef = null;
let themeHintRef = null;

/* ------------------------------------------------------------------ *
 * 顶栏
 * ------------------------------------------------------------------ */

function buildHeader() {
  return h('header.app-header', {}, [
    h('p', {
      style: { fontSize: '11px', color: 'var(--c-muted)', lineHeight: '1', marginBottom: '6px' },
    }, '我的'),
    h('h1.app-header__title', {}, '设置'),
  ]);
}

/* ------------------------------------------------------------------ *
 * 通用构件
 * ------------------------------------------------------------------ */

function buildGroup(title, rows) {
  const card = h('div.card', { style: { overflow: 'hidden' } });
  rows.forEach((row, index) => {
    if (index > 0) card.append(h('div.list-divider'));
    card.append(row);
  });
  return h('section', { style: { marginTop: '16px' } }, [
    h('h2', {
      style: { fontSize: '11px', color: 'var(--c-muted)', padding: '0 4px', marginBottom: '8px' },
    }, title),
    card,
  ]);
}

/**
 * 设置行
 * @param {object} options
 * @param {string} options.iconName  图标
 * @param {string} options.title     标题
 * @param {string} [options.desc]    描述
 * @param {string} [options.href]    跳转目标（传了即为链接行）
 * @param {Function} [options.onClick] 点击回调
 * @param {HTMLElement} [options.trailing] 行尾自定义内容
 * @param {boolean} [options.danger] 危险操作（红色）
 */
function settingRow({ iconName, title, desc, href, onClick, trailing, danger }) {
  const props = {
    class: 'setting-item',
    style: { background: 'transparent', textAlign: 'left' },
  };
  if (href) props.href = href;
  else {
    props.type = 'button';
    props.onclick = onClick;
  }

  return h(href ? 'a' : 'button', props, [
    h('div.setting-item__icon', {
      style: danger ? { color: 'var(--c-expense)', background: 'var(--c-bg)' } : {},
    }, icon(iconName, 'text-[15px]')),
    h('div.flex-1', {}, [
      h('p.setting-item__title', {
        style: danger ? { color: 'var(--c-expense)' } : {},
      }, title),
      desc ? h('p.setting-item__desc', {}, desc) : null,
    ]),
    trailing || null,
    href ? icon('ph:caret-right', 'text-[13px]') : null,
  ]);
}

function buildSwitch(on, onToggle) {
  const knob = h('div.switch__knob');
  const sw = h('div.switch', {
    class: on ? 'is-on' : '',
    role: 'switch',
    tabindex: '0',
    'aria-checked': on ? 'true' : 'false',
  }, knob);

  sw.addEventListener('click', (e) => {
    e.stopPropagation();
    onToggle();
  });
  sw.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    }
  });

  return sw;
}

/* ------------------------------------------------------------------ *
 * 用户概览卡
 * ------------------------------------------------------------------ */

/** 从第一笔流水算起坚持记账的天数 */
function daysOfBookkeeping(all) {
  if (!all.length) return 0;
  let earliest = null;
  all.forEach((tx) => {
    if (!earliest || tx.occurredAt < earliest) earliest = tx.occurredAt;
  });
  const start = toDate(earliest);
  const now = new Date();
  const days = Math.floor(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()) -
      new Date(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000
  );
  return Math.max(1, days + 1);
}

function buildUserCard() {
  const month = monthKey();
  const summary = store.summary(month);
  const budget = store.getBudget(month);
  const all = store.listTransactions();
  const account = auth.getAccount();

  const stat = (label, value) => h('div', {}, [
    h('p', { style: { fontSize: '9.5px', color: 'var(--c-brand-tint)' } }, label),
    h('p.num', {
      style: { fontSize: '13px', fontWeight: '600', color: 'var(--c-on-brand)', marginTop: '2px' },
    }, value),
  ]);

  return h('section', {
    style: {
      position: 'relative', overflow: 'hidden',
      background: 'var(--c-brand)', borderRadius: '24px', padding: '16px',
    },
  }, [
    h('div', {
      style: {
        position: 'absolute', right: '-24px', bottom: '-40px',
        width: '112px', height: '112px', borderRadius: '999px',
        background: 'rgba(255,255,255,0.10)',
      },
    }),
    h('div', {
      style: { position: 'relative', display: 'flex', alignItems: 'center', gap: '12px' },
    }, [
      h('div', {
        style: {
          width: '48px', height: '48px', borderRadius: '999px', background: 'var(--c-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
          flexShrink: '0',
        },
      }, account ? account.avatar : '🌿'),
      h('div.flex-1', {}, [
        h('p', { style: { fontSize: '15px', fontWeight: '600', color: 'var(--c-on-brand)' } },
          account ? account.nickname : '我的账本'),
        h('p', { style: { fontSize: '10.5px', color: 'var(--c-brand-tint)', marginTop: '2px' } },
          account
            ? `账号 ${account.account} · 坚持记账 ${daysOfBookkeeping(all)} 天`
            : `坚持记账 ${daysOfBookkeeping(all)} 天 · 累计 ${all.length} 笔`),
      ]),
    ]),
    h('div', {
      style: {
        position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px', marginTop: '12px',
      },
    }, [
      stat('本月支出', `¥${formatAmount(summary.expense)}`),
      stat('本月结余', `¥${formatAmount(summary.balance)}`),
      stat('预算使用', budget ? `${Math.round(budget.percent)}%` : '未设置'),
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 账号
 * ------------------------------------------------------------------ */

/**
 * 通用单字段输入弹层
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.label
 * @param {string} [options.value]
 * @param {string} [options.placeholder]
 * @param {string} [options.hint]
 * @param {number} [options.maxlength]
 * @param {string} [options.type]
 * @returns {Promise<string|null>} 提交的值，取消返回 null
 */
function openPrompt({ title, label, value = '', placeholder = '', hint = '', maxlength = 20, type = 'text' }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const input = h('input.input', {
      type,
      value,
      placeholder,
      maxlength: String(maxlength),
      'aria-label': label,
    });

    const { close, backdrop } = createOverlay(() =>
      h('div', { style: { padding: '4px 20px 20px' } }, [
        h('h2', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '14px' } }, title),
        h('div.field', {}, [
          h('label.field__label', {}, label),
          input,
          hint ? h('p', { style: { fontSize: '11px', color: 'var(--c-faint)' } }, hint) : null,
        ]),
        h('div.row.gap-2', { style: { marginTop: '18px' } }, [
          h('button', {
            type: 'button',
            class: 'btn btn--ghost btn--block',
            onclick: () => {
              close();
              finish(null);
            },
          }, '取消'),
          h('button', {
            type: 'button',
            class: 'btn btn--primary btn--block',
            onclick: () => {
              const submitted = input.value;
              close();
              finish(submitted);
            },
          }, '确定'),
        ]),
      ])
    );

    // 点击遮罩关闭 → 视为取消
    backdrop.addEventListener('click', () => finish(null));
    setTimeout(() => input.focus(), 320);
  });
}

async function handleEditNickname() {
  const account = auth.getAccount();
  if (!account) return;

  const value = await openPrompt({
    title: '修改昵称',
    label: '昵称',
    value: account.nickname,
    placeholder: '给自己起个名字',
    maxlength: AUTH_RULES.MAX_NICKNAME_LENGTH,
    hint: `不超过 ${AUTH_RULES.MAX_NICKNAME_LENGTH} 字`,
  });
  if (value === null) return;

  const result = auth.updateProfile({ nickname: value });
  if (!result.ok) {
    showToast(result.message);
    return;
  }
  showToast('昵称已更新');
  render();
}

async function handleChangePassword() {
  const oldPassword = await openPrompt({
    title: '修改密码 · 第一步',
    label: '原密码',
    type: 'password',
    placeholder: '请输入原密码',
  });
  if (oldPassword === null) return;

  const newPassword = await openPrompt({
    title: '修改密码 · 第二步',
    label: '新密码',
    type: 'password',
    placeholder: '设置新密码',
    hint: `至少 ${AUTH_RULES.MIN_PASSWORD_LENGTH} 位`,
  });
  if (newPassword === null) return;

  const result = await auth.changePassword({ oldPassword, newPassword });
  if (!result.ok) {
    showToast(result.message);
    return;
  }
  showToast('密码已修改');
}

async function handleLogout() {
  const confirmed = await confirmDialog({
    title: '确认退出登录？',
    message: '退出后需要重新输入账号密码才能进入应用。你的账目数据会完整保留在本机。',
    confirmText: '退出登录',
    cancelText: '再想想',
    variant: 'danger',
  });
  if (!confirmed) return;

  auth.logout();
  window.location.replace(ROUTES.login);
}

function buildAccountRows() {
  const account = auth.getAccount();
  if (!account) return [];

  return [
    settingRow({
      iconName: 'ph:user-circle',
      title: '登录账号',
      desc: account.account,
      trailing: h('span', { style: { fontSize: '11px', color: 'var(--c-faint)' } }, '本机账号'),
    }),
    settingRow({
      iconName: 'ph:pencil-simple',
      title: '修改昵称',
      desc: `当前昵称：${account.nickname}`,
      onClick: handleEditNickname,
    }),
    settingRow({
      iconName: 'ph:lock-key',
      title: '修改密码',
      desc: '修改后下次登录使用新密码',
      onClick: handleChangePassword,
    }),
    settingRow({
      iconName: 'ph:sign-out',
      title: '退出登录',
      desc: '账目数据会保留在本机',
      onClick: handleLogout,
      danger: true,
    }),
  ];
}

/* ------------------------------------------------------------------ *
 * 预算 / 分类管理
 * ------------------------------------------------------------------ */

function buildBudgetRow() {
  const month = monthKey();
  const budget = store.getBudget(month);
  const desc = budget
    ? `总预算 ¥${formatAmount(budget.amount)} · 已用 ${Math.round(budget.percent)}%`
    : '尚未设置月度预算';

  const row = settingRow({
    iconName: 'ph:target',
    title: '月度预算',
    desc,
    href: ROUTES.budget,
  });

  if (budget) {
    const percent = Math.min(100, Math.round(budget.percent));
    const levelClass = budget.level === 'danger' ? 'is-danger' : budget.level === 'warn' ? 'is-warn' : '';
    row.querySelector('.flex-1').append(
      h('div.progress', { style: { height: '6px', marginTop: '6px' } }, [
        h('div.progress__bar', { class: levelClass, style: { width: `${percent}%` } }),
      ])
    );
  }

  return row;
}

function buildCategoryRow() {
  const expenseCount = store.listCategories('expense').length;
  const incomeCount = store.listCategories('income').length;
  return settingRow({
    iconName: 'ph:tag',
    title: '分类管理',
    desc: `${expenseCount} 个支出分类 · ${incomeCount} 个收入分类`,
    href: ROUTES.categories,
  });
}

/* ------------------------------------------------------------------ *
 * 数据 / 提醒 / 外观 / 关于
 * ------------------------------------------------------------------ */

function buildDataRows() {
  const historyCount = store.listExportHistory().length;
  return [
    settingRow({
      iconName: 'ph:download-simple',
      title: '数据导出',
      desc: '导出 CSV，可分享到其他设备',
      href: ROUTES.exportData,
    }),
    settingRow({
      iconName: 'ph:clock-counter-clockwise',
      title: '导出记录',
      desc: historyCount ? `共 ${historyCount} 条导出记录` : '暂无导出记录',
      href: ROUTES.exportHistory,
    }),
    settingRow({
      iconName: 'ph:trash',
      title: '清除全部数据',
      desc: '清除所有流水与设置，不可恢复',
      danger: true,
      onClick: handleWipe,
    }),
  ];
}

function buildReminderRow() {
  const settings = store.getSettings();
  const time = settings.reminderTime || '21:30';
  const desc = settings.reminderEnabled ? `每天 ${time} · 已开启` : '未开启';
  return settingRow({
    iconName: 'ph:bell-ringing',
    title: '记账提醒',
    desc,
    href: ROUTES.reminder,
  });
}

function buildThemeRow() {
  const settings = store.getSettings();
  const dark = settings.theme === 'dark';

  themeSwitchRef = buildSwitch(dark, toggleTheme);
  themeHintRef = h('p.setting-item__desc', {}, '深色主题尚未实现，开关仅保存偏好');

  return h('button.setting-item', {
    type: 'button',
    style: { background: 'transparent', textAlign: 'left' },
    onclick: toggleTheme,
  }, [
    h('div.setting-item__icon', {}, icon('ph:moon', 'text-[15px]')),
    h('div.flex-1', {}, [
      h('p.setting-item__title', {}, '深色模式'),
      themeHintRef,
    ]),
    themeSwitchRef,
  ]);
}

function buildAboutRows() {
  return [
    settingRow({
      iconName: 'ph:info',
      title: '关于本应用',
      desc: `随手记账 ${APP_VERSION}`,
      onClick: openAbout,
    }),
    settingRow({
      iconName: 'ph:shield-check',
      title: '隐私政策',
      desc: '数据仅保存在本机，不上传云端',
      onClick: openPolicy,
    }),
  ];
}

/* ------------------------------------------------------------------ *
 * 交互
 * ------------------------------------------------------------------ */

function toggleTheme() {
  const next = store.getSettings().theme === 'dark' ? 'light' : 'dark';
  store.updateSettings({ theme: next });

  if (themeSwitchRef) {
    themeSwitchRef.classList.toggle('is-on', next === 'dark');
    themeSwitchRef.setAttribute('aria-checked', next === 'dark' ? 'true' : 'false');
  }
  if (themeHintRef) {
    themeHintRef.textContent = next === 'dark'
      ? '深色主题尚未实现，开关仅保存偏好'
      : '当前为浅色模式，深色主题尚未实现';
  }

  showToast(next === 'dark' ? '已记录深色偏好（主题尚未实现）' : '已切换为浅色模式');
}

async function handleWipe() {
  const count = store.listTransactions().length;
  const confirmed = await confirmDialog({
    title: '确认清除全部数据？',
    message: `将删除 ${count} 笔流水、自定义分类与预算设置（预设分类会保留），操作不可恢复。建议先导出备份。`,
    confirmText: '确认清除',
    cancelText: '取消',
    variant: 'danger',
  });
  if (!confirmed) return;

  store.wipeAll();
  showToast('已清除全部数据');
  render();
}

function openAbout() {
  alertDialog({
    title: '关于随手记账',
    message: `版本 ${APP_VERSION} · 一个纯本地的个人消费记账工具：所有流水、分类、预算都保存在你自己的设备上，不上传云端，也不收集任何个人信息。`,
    confirmText: '好的',
  });
}

const POLICY_ITEMS = [
  ['1. 数据存储', '你的所有流水、预算与分类数据仅保存在本机设备，不经过任何服务器上传，卸载应用后数据将被删除。'],
  ['2. 信息收集范围', '我们仅读取你在应用中主动填写的金额、分类、备注与日期，不收集通讯录、位置、相册等无关信息。'],
  ['3. 数据导出', '导出的 CSV 文件由你自行保管与分享，导出过程不会向第三方服务发送数据。'],
  ['4. 提醒通知', '记账提醒由系统本地通知实现，可随时在设置中关闭。'],
  ['5. 你的权利', '你可以随时导出全部数据、清除数据或卸载应用以终止使用。'],
];

function openPolicy() {
  createOverlay((close) => h('div', { style: { padding: '0 20px 20px' } }, [
    h('div.row-between', {}, [
      h('h2', { style: { fontSize: '15px', fontWeight: '600' } }, '隐私政策'),
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
    h('div', {
      style: {
        marginTop: '12px', maxHeight: '46vh', overflowY: 'auto',
        fontSize: '11.5px', color: 'var(--c-ink-soft)', lineHeight: '1.7',
      },
    }, [
      h('p', { style: { fontSize: '10.5px', color: 'var(--c-muted)', marginBottom: '8px' } },
        '更新日期：2026 年 10 月 1 日'),
      ...POLICY_ITEMS.map(([title, body]) => h('p', { style: { marginBottom: '10px' } }, [
        h('span', { style: { fontWeight: '600', color: 'var(--c-ink)' } }, `${title}\n`),
        h('span', {}, body),
      ])),
    ]),
    h('button.btn.btn--primary.btn--block', {
      type: 'button',
      style: { marginTop: '16px' },
      onclick: close,
    }, '我已知晓'),
  ]));
}

/* ------------------------------------------------------------------ *
 * 渲染与初始化
 * ------------------------------------------------------------------ */

function render() {
  clear(bodyRef);
  bodyRef.append(
    buildUserCard(),
    buildGroup('账号', buildAccountRows()),
    buildGroup('预算', [buildBudgetRow()]),
    buildGroup('分类管理', [buildCategoryRow()]),
    buildGroup('数据', buildDataRows()),
    buildGroup('提醒', [buildReminderRow()]),
    buildGroup('外观', [buildThemeRow()]),
    buildGroup('关于', buildAboutRows()),
    h('div', {
      style: {
        marginTop: '16px', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: '6px', fontSize: '10px', color: 'var(--c-faint)',
      },
    }, [
      icon('ph:lock-key', 'text-[11px]'),
      h('span', {}, '数据仅保存在本机，不上传云端'),
    ]),
    h('p', {
      style: { textAlign: 'center', fontSize: '10px', color: 'var(--c-faint)', marginTop: '6px' },
    }, `随手记账 ${APP_VERSION} · 2026.10`)
  );
}

function init() {
  const page = createPage({
    title: '设置',
    tab: 'settings',
    // 原型顶栏为「我的 / 设置」两级标题，用自定义顶栏还原
    header: buildHeader,
  });
    // 未登录时已被重定向到登录页
    if (!page) return;

  bodyRef = h('div', {});
  page.body.append(bodyRef);

  render();
}

init();
