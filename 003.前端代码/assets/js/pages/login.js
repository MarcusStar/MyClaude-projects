/**
 * 页面：登录 / 注册 —— PRD P-11 账号与登录
 * ------------------------------------------------------------------
 * 应用的入口门禁页。两种形态：
 *   · 登录：已有账号时使用，输入账号与密码；
 *   · 注册：首次使用（或从未注册过）时使用，需设置昵称、账号与密码，
 *            并勾选同意《用户协议》与《隐私政策》（PRD 五：隐私合规）。
 *
 * 账号与账目数据都只保存在本机，密码以「随机盐 + 哈希」存储。
 */

import { h, icon } from '../core/dom.js';
import { auth } from '../core/auth.js';
import { ROUTES, AUTH_RULES } from '../core/constants.js';
import { showToast } from '../core/toast.js';
import { alertDialog } from '../components/dialog.js';

/* ------------------------------------------------------------------ *
 * 页面状态
 * ------------------------------------------------------------------ */

const state = {
  mode: auth.isRegistered() ? 'login' : 'register',
  showPassword: false,
  agreed: false,
  avatar: '🙂',
};

/** 可选头像 */
const AVATARS = ['🙂', '😀', '🐱', '🐼', '🦊', '🐧', '🌿', '☕', '💰', '📚'];

/** 登录成功后要去的页面 */
function getRedirect() {
  const raw = new URLSearchParams(window.location.search).get('redirect');
  // 只允许站内相对路径，避免被构造成外站地址
  if (!raw || raw.includes('/') || raw.includes('..')) return ROUTES.home;
  return raw;
}

/* ------------------------------------------------------------------ *
 * 表单构件
 * ------------------------------------------------------------------ */

/**
 * 带标签的输入框
 * @param {object} options
 * @param {string} options.label
 * @param {string} options.placeholder
 * @param {string} options.type
 * @param {string} [options.hint]
 * @param {string} [options.prefix]  输入框左侧固定前缀
 * @param {string} [options.suffix]  输入框右侧固定后缀
 * @param {boolean} [options.toggable] 是否显示「显示/隐藏密码」按钮
 * @param {Function} [options.onInput]
 */
function buildField(options) {
  const {
    label,
    placeholder = '',
    type = 'text',
    hint = '',
    prefix = '',
    suffix = '',
    toggable = false,
    onInput,
  } = options;

  const input = h('input.input', {
    type: toggable && !state.showPassword ? 'password' : type,
    placeholder,
    autocomplete: 'off',
    oninput: (e) => onInput && onInput(e.target.value),
  });

  const toggleBtn = toggable
    ? h('button', {
        type: 'button',
        'aria-label': state.showPassword ? '隐藏密码' : '显示密码',
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '32px', height: '32px', flexShrink: '0', color: 'var(--c-muted)',
        },
        onclick: () => {
          state.showPassword = !state.showPassword;
          const next = state.showPassword ? 'text' : 'password';
          input.type = next;
          toggleBtn.replaceChildren(icon(state.showPassword ? 'ph:eye-slash' : 'ph:eye'));
          toggleBtn.setAttribute('aria-label', state.showPassword ? '隐藏密码' : '显示密码');
        },
      }, icon(state.showPassword ? 'ph:eye-slash' : 'ph:eye'))
    : null;

  const control = h('div', {
    class: 'input flex items-center gap-2',
    style: { paddingRight: toggable ? '4px' : 'var(--s-4)' },
  }, [
    prefix ? h('span', { style: { fontSize: '13px', color: 'var(--c-muted)', flexShrink: '0' } }, prefix) : null,
    input,
    suffix ? h('span', { style: { fontSize: '12px', color: 'var(--c-muted)', flexShrink: '0' } }, suffix) : null,
    toggleBtn,
  ]);

  return h('div.field', {}, [
    h('label.field__label', {}, label),
    control,
    hint ? h('p', { style: { fontSize: '11px', color: 'var(--c-faint)' } }, hint) : null,
  ]);
}

/** 头像选择 */
function buildAvatarPicker() {
  const grid = h('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' },
  });

  const render = () => {
    grid.replaceChildren(...AVATARS.map((emoji) =>
      h('button', {
        type: 'button',
        'aria-label': `选择头像 ${emoji}`,
        style: {
          height: '40px', borderRadius: '12px', fontSize: '20px',
          background: state.avatar === emoji ? 'var(--c-brand-soft)' : 'var(--c-bg)',
          border: state.avatar === emoji ? '1.5px solid var(--c-brand)' : '1px solid var(--c-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
        onclick: () => {
          state.avatar = emoji;
          render();
        },
      }, emoji)
    ));
  };
  render();

  return h('div.field', {}, [
    h('span.field__label', {}, '选个头像'),
    grid,
  ]);
}

/** 协议勾选行 */
function buildAgreement() {
  const box = h('button', {
    type: 'button',
    role: 'checkbox',
    'aria-checked': String(state.agreed),
    'aria-label': '同意用户协议与隐私政策',
    style: {
      width: '18px', height: '18px', borderRadius: '5px', flexShrink: '0',
      border: state.agreed ? 'none' : '1.5px solid var(--c-line)',
      background: state.agreed ? 'var(--c-brand)' : 'transparent',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    onclick: () => {
      state.agreed = !state.agreed;
      render();
    },
  }, state.agreed ? icon('ph:check', 'text-[12px]') : null);

  const wrap = h('div', { class: 'row gap-2', style: { alignItems: 'flex-start' } }, [
    box,
    h('p', { style: { fontSize: '11.5px', color: 'var(--c-muted)', lineHeight: '1.6' } }, [
      '我已阅读并同意 ',
      h('a', {
        href: '#',
        style: { color: 'var(--c-brand)' },
        onclick: (e) => {
          e.preventDefault();
          openPolicy('用户协议');
        },
      }, '《用户协议》'),
      ' 与 ',
      h('a', {
        href: '#',
        style: { color: 'var(--c-brand)' },
        onclick: (e) => {
          e.preventDefault();
          openPolicy('隐私政策');
        },
      }, '《隐私政策》'),
    ]),
  ]);

  function render() {
    box.replaceChildren(state.agreed ? icon('ph:check', 'text-[12px]') : null);
    box.style.border = state.agreed ? 'none' : '1.5px solid var(--c-line)';
    box.style.background = state.agreed ? 'var(--c-brand)' : 'transparent';
    box.setAttribute('aria-checked', String(state.agreed));
  }

  return wrap;
}

/* ------------------------------------------------------------------ *
 * 登录表单
 * ------------------------------------------------------------------ */

function buildLoginForm() {
  const accountInput = { value: '' };
  const passwordInput = { value: '' };

  const submitBtn = h('button', {
    type: 'submit',
    class: 'btn btn--primary btn--block',
    style: { marginTop: '4px' },
  }, '登录');

  const form = h('form', {
    class: 'col gap-4',
    onsubmit: async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.textContent = '登录中…';

      const result = await auth.login({
        account: accountInput.value,
        password: passwordInput.value,
      });

      submitBtn.disabled = false;
      submitBtn.textContent = '登录';

      if (!result.ok) {
        showToast(result.message);
        return;
      }
      showToast(`欢迎回来，${result.account.nickname}`);
      setTimeout(() => {
        window.location.replace(getRedirect());
      }, 400);
    },
  }, [
    buildField({
      label: '账号 / 手机号',
      placeholder: '请输入账号或手机号',
      onInput: (v) => { accountInput.value = v; },
    }),
    buildField({
      label: '密码',
      placeholder: '请输入密码',
      type: 'password',
      toggable: true,
      onInput: (v) => { passwordInput.value = v; },
    }),
    h('div.row-between', {}, [
      h('span', { style: { fontSize: '11.5px', color: 'var(--c-faint)' } }, '账号数据仅保存在本机'),
      h('button', {
        type: 'button',
        style: { fontSize: '12px', color: 'var(--c-brand)' },
        onclick: () => {
          alertDialog({
            title: '忘记密码',
            message: '本应用的账号与密码都保存在你自己的设备上，没有服务器也无法找回。\n\n如果忘记了密码，可以在浏览器控制台执行 localStorage.removeItem("ledger:v1:auth") 后刷新，重新注册一个账号。',
          });
        },
      }, '忘记密码？'),
    ]),
    submitBtn,
  ]);

  return form;
}

/* ------------------------------------------------------------------ *
 * 注册表单
 * ------------------------------------------------------------------ */

function buildRegisterForm() {
  const values = { nickname: '', account: '', password: '', confirm: '' };

  const submitBtn = h('button', {
    type: 'submit',
    class: 'btn btn--primary btn--block',
  }, '注册并开始记账');

  const form = h('form', {
    class: 'col gap-4',
    onsubmit: async (e) => {
      e.preventDefault();

      if (!state.agreed) {
        showToast('请先阅读并同意用户协议与隐私政策');
        return;
      }
      if (values.password !== values.confirm) {
        showToast('两次输入的密码不一致');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '注册中…';

      const result = await auth.register({
        account: values.account,
        nickname: values.nickname,
        password: values.password,
        avatar: state.avatar,
      });

      submitBtn.disabled = false;
      submitBtn.textContent = '注册并开始记账';

      if (!result.ok) {
        showToast(result.message);
        return;
      }
      showToast('注册成功，开始记账吧');
      setTimeout(() => {
        window.location.replace(getRedirect());
      }, 400);
    },
  }, [
    buildAvatarPicker(),
    buildField({
      label: '昵称',
      placeholder: '给自己起个名字',
      hint: `不超过 ${AUTH_RULES.MAX_NICKNAME_LENGTH} 字`,
      onInput: (v) => { values.nickname = v; },
    }),
    buildField({
      label: '账号 / 手机号',
      placeholder: '用于登录，可填手机号',
      hint: '4～20 位字母数字，或 11 位手机号',
      onInput: (v) => { values.account = v; },
    }),
    buildField({
      label: '密码',
      placeholder: '设置登录密码',
      type: 'password',
      toggable: true,
      hint: `至少 ${AUTH_RULES.MIN_PASSWORD_LENGTH} 位`,
      onInput: (v) => { values.password = v; },
    }),
    buildField({
      label: '确认密码',
      placeholder: '再次输入密码',
      type: 'password',
      onInput: (v) => { values.confirm = v; },
    }),
    buildAgreement(),
    submitBtn,
  ]);

  return form;
}

/* ------------------------------------------------------------------ *
 * 协议弹窗
 * ------------------------------------------------------------------ */

function openPolicy(title) {
  const content = title === '用户协议'
    ? [
        '一、服务说明',
        '「随手记账」是一款纯本地的个人消费记录工具，提供记账、统计、预算与数据导出功能。',
        '',
        '二、账号说明',
        '账号与密码仅保存在你自己的设备上，开发者无法获取，也无法找回。',
        '',
        '三、使用规范',
        '请勿用于记录违法用途；导出数据时请注意自行保管，避免泄露个人消费信息。',
      ]
    : [
        '一、我们收集什么',
        '本应用不收集、不上传任何个人信息。全部账目、账号与设置都保存在你的浏览器本地存储中。',
        '',
        '二、数据的去向',
        '数据只存在于当前浏览器。除非你主动使用「数据导出」生成 CSV 文件，否则数据不会离开设备。',
        '',
        '三、你的控制权',
        '你可以在「设置 → 清除全部数据」中一键删除全部账目、账号与设置。',
        '',
        '四、第三方服务',
        '页面会从公共 CDN 加载 Tailwind 与 Iconify 样式资源，这些请求不包含你的账目信息。',
      ];

  alertDialog({ title, message: content.join('\n') });
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

const bodyRef = h('div', { class: 'col' });

function render() {
  bodyRef.replaceChildren();

  const isLogin = state.mode === 'login';

  /* 品牌区 */
  bodyRef.append(
    h('div', { style: { textAlign: 'center', marginBottom: '26px' } }, [
      h('div', {
        class: 'icon-badge',
        style: {
          width: '60px', height: '60px', margin: '0 auto 16px',
          background: 'var(--c-brand-soft)', color: 'var(--c-brand)', fontSize: '28px',
          borderRadius: '18px',
        },
      }, icon('ph:wallet-duotone', 'text-[30px]')),
      h('h1', { style: { fontSize: '22px', fontWeight: '600' } }, '随手记账'),
      h('p', { style: { fontSize: '12.5px', color: 'var(--c-muted)', marginTop: '6px' } },
        '3 秒记一笔，月底不糊涂'),
    ])
  );

  /* 表单卡 */
  const card = h('section.card', { style: { padding: '22px 20px 20px' } }, [
    h('h2', { style: { fontSize: '17px', fontWeight: '600' } },
      isLogin ? '欢迎回来' : '创建账号'),
    h('p', { style: { fontSize: '12px', color: 'var(--c-muted)', marginTop: '5px', marginBottom: '20px' } },
      isLogin
        ? '登录后继续你的记账'
        : '账号只保存在本机，注册即可开始使用'),
    isLogin ? buildLoginForm() : buildRegisterForm(),
  ]);

  bodyRef.append(card);

  /* 模式切换 */
  bodyRef.append(
    h('div', {
      style: { textAlign: 'center', marginTop: '20px', fontSize: '12.5px', color: 'var(--c-muted)' },
    }, [
      isLogin ? '还没有账号？' : '已经有账号了？',
      h('button', {
        type: 'button',
        style: { color: 'var(--c-brand)', fontWeight: '500', marginLeft: '4px' },
        onclick: () => {
          state.mode = isLogin ? 'register' : 'login';
          state.agreed = false;
          render();
        },
      }, isLogin ? '立即注册' : '去登录'),
    ])
  );

  /* 底部说明 */
  bodyRef.append(
    h('p', {
      style: {
        textAlign: 'center', fontSize: '11px', color: 'var(--c-faint)',
        marginTop: '28px', lineHeight: '1.7',
      },
    }, '数据保存在本机浏览器，不上传云端\n清除浏览器数据会丢失账目，请及时导出备份')
  );
}

/* ------------------------------------------------------------------ *
 * 初始化
 * ------------------------------------------------------------------ */

function init() {
  const frame = h('div.app-frame', {}, [
    // .app-body 自带 overflow-y: auto，这里只调内边距，保持页面可滚动
    h('main.app-body.scroll-area', { style: { padding: '40px 20px 28px' } }, [bodyRef]),
  ]);
  (document.getElementById('app') || document.body).append(frame);

  // 已登录则直接进入应用
  if (auth.isLoggedIn()) {
    window.location.replace(getRedirect());
    return;
  }

  render();
}

init();
