/**
 * 页面：记账提醒 —— PRD FR-10
 * ------------------------------------------------------------------
 * 每日固定时间本地提醒记账：总开关、提醒时间、重复星期、辅助提醒。
 * PRD FR-10 R1：可自定义提醒时间（默认 22:00）；
 *            R2：当天已有记账行为时不发送提醒；
 *            R3：仅使用本地通知，不涉及服务端推送。
 */

import { h, icon, clear, go } from '../core/dom.js';
import { createPage } from '../components/shell.js';
import { showToast } from '../core/toast.js';
import { store } from '../core/store.js';
import { ROUTES } from '../core/constants.js';
import { dateKey } from '../core/format.js';

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** PRD FR-10 R1：默认提醒时间 22:00 */
const DEFAULT_REMINDER_TIME = '22:00';

/** 星期 chip：value 为 Date.getDay() 的字符串 */
const DAY_CHIPS = [
  { key: '1', label: '一' },
  { key: '2', label: '二' },
  { key: '3', label: '三' },
  { key: '4', label: '四' },
  { key: '5', label: '五' },
  { key: '6', label: '六' },
  { key: '0', label: '日' },
];

/** Date.getDay() → 中文星期 */
const WEEKDAY_BY_KEY = {
  0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六',
};

/** 快捷时间 */
const QUICK_TIMES = ['08:30', '12:30', '21:30', '22:00'];

/** 提醒文案（可轮播） */
const REMINDER_COPIES = [
  '「今天花了多少？30 秒记一笔就睡吧 🌙」',
  '「别忘了今天的奶茶和地铁，顺手记一下 ☕」',
  '「坚持记账 214 天啦，今天的账还差一笔 ✍️」',
];

/* ------------------------------------------------------------------ *
 * 状态（真实来源：store.getSettings）
 * ------------------------------------------------------------------ */

const state = {
  enabled: true,
  time: DEFAULT_REMINDER_TIME,
  days: ['1', '2', '3', '4', '5', '0'],
  second: false,
  copyIndex: 0,
};

function loadSettings() {
  const settings = store.getSettings();
  state.enabled = settings.reminderEnabled !== false;
  state.time = settings.reminderTime || DEFAULT_REMINDER_TIME;
  state.days = Array.isArray(settings.reminderDays) && settings.reminderDays.length
    ? [...settings.reminderDays]
    : ['1', '2', '3', '4', '5', '0'];
  state.second = Boolean(settings.reminderSecond);
  state.copyIndex = Number(settings.reminderCopyIndex) || 0;
}

/** 写入设置（PRD FR-10：开关 / 时间 / 重复日持久化） */
function saveSettings() {
  store.updateSettings({
    reminderEnabled: state.enabled,
    reminderTime: state.time,
    reminderDays: state.days,
    reminderSecond: state.second,
    reminderCopyIndex: state.copyIndex,
  });
}

/* ------------------------------------------------------------------ *
 * 业务辅助
 * ------------------------------------------------------------------ */

/** 当天已有记账行为（PRD FR-10 R2） */
function todayRecordCount() {
  const today = dateKey(new Date());
  return store.listTransactions({ from: today, to: today }).length;
}

/** 下次提醒时间描述 */
function nextReminderText() {
  if (!state.enabled) return '--:--';
  if (!state.days.length) return '未选择提醒日';
  const current = new Date().getDay();
  for (let i = 0; i < 8; i += 1) {
    const key = String((current + i) % 7);
    if (state.days.includes(key)) {
      const label = i === 0 ? '今天' : `周${WEEKDAY_BY_KEY[key]}`;
      return `${label} ${state.time}`;
    }
  }
  return '--:--';
}

/** 重复周期描述 */
function daysHint() {
  if (!state.days.length) return '当前：未选择任何重复日，提醒不会触发';
  const labels = DAY_CHIPS.filter((d) => state.days.includes(d.key)).map((d) => d.label);
  return `当前：每周${labels.join('、')} 提醒`;
}

/* ------------------------------------------------------------------ *
 * 通用组件
 * ------------------------------------------------------------------ */

/** 开关 */
function buildSwitch(on, onToggle, label) {
  return h('button.switch', {
    type: 'button',
    class: on ? 'is-on' : '',
    'aria-label': label,
    'aria-pressed': on ? 'true' : 'false',
    onclick: onToggle,
  }, h('span.switch__knob'));
}

/** 圆角图标底座 */
function iconBadge(iconName) {
  return h('div', {
    style: {
      width: '40px', height: '40px', borderRadius: '13px',
      background: 'var(--c-brand-soft)', color: 'var(--c-brand)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '20px', flexShrink: 0,
    },
  }, icon(iconName));
}

/** 卡片 */
function card(children, extraStyle = {}) {
  return h('section.card', { style: { padding: '16px', ...extraStyle } }, children);
}

/* ------------------------------------------------------------------ *
 * 区块
 * ------------------------------------------------------------------ */

/** 总开关 */
function buildMainCard() {
  return card([
    h('div.row.gap-3', {}, [
      iconBadge('ph:bell-ringing'),
      h('div', { style: { flex: '1', minWidth: 0 } }, [
        h('p', { style: { fontSize: '13.5px', fontWeight: '500' } }, '每日记账提醒'),
        h('p', {
          style: { fontSize: '10.5px', color: 'var(--c-muted)', marginTop: '2px' },
        }, '在你指定的时间提醒补充今天的花销'),
      ]),
      buildSwitch(state.enabled, toggleMain, '开关每日提醒'),
    ]),
  ]);
}

/** 提醒时间 */
function buildTimeCard() {
  const [hour, minute] = String(state.time).split(':');
  const count = todayRecordCount();
  const dim = state.enabled ? {} : { opacity: '0.5', pointerEvents: 'none' };

  const quickRow = h('div.row.gap-1', { style: { marginTop: '12px' } },
    QUICK_TIMES.map((time) => h('button', {
      type: 'button',
      style: {
        flex: '1', padding: '8px 0', borderRadius: '10px', fontSize: '11px',
        background: state.time === time ? 'var(--c-brand-soft)' : 'var(--c-bg)',
        color: state.time === time ? 'var(--c-brand-deep)' : 'var(--c-ink-soft)',
      },
      onclick: () => setTime(time),
    }, time)));

  return h('section.card', { style: { marginTop: '12px', padding: '16px', ...dim } }, [
    h('div.row-between', {}, [
      h('p', { style: { fontSize: '12.5px', fontWeight: '500' } }, '提醒时间'),
      h('span', {
        style: {
          fontSize: '10.5px',
          color: state.enabled ? 'var(--c-brand)' : 'var(--c-muted)',
        },
      }, state.enabled ? '已开启' : '已关闭'),
    ]),
    h('div.row', {
      style: { justifyContent: 'center', alignItems: 'flex-end', gap: '4px', marginTop: '12px' },
    }, [
      h('div', { style: { textAlign: 'center' } }, [
        h('p.num', { style: { fontSize: '40px', fontWeight: '600', lineHeight: '1' } }, hour),
        h('p', { style: { fontSize: '9.5px', color: 'var(--c-muted)', marginTop: '4px' } }, '时'),
      ]),
      h('p.num', {
        style: {
          fontSize: '32px', fontWeight: '600', color: 'var(--c-faint)',
          paddingBottom: '16px', lineHeight: '1',
        },
      }, ':'),
      h('div', { style: { textAlign: 'center' } }, [
        h('p.num', { style: { fontSize: '40px', fontWeight: '600', lineHeight: '1' } }, minute),
        h('p', { style: { fontSize: '9.5px', color: 'var(--c-muted)', marginTop: '4px' } }, '分'),
      ]),
    ]),
    h('div', {
      style: {
        marginTop: '12px', borderRadius: '12px', background: 'var(--c-bg)',
        padding: '10px 14px',
      },
    }, [
      h('div.row.gap-1', { style: { justifyContent: 'center', alignItems: 'center' } }, [
        icon('ph:clock', 'text-[12px]'),
        h('p', { style: { fontSize: '10.5px', color: 'var(--c-ink-soft)' } }, [
          '下次提醒：', h('span.num', { style: { fontWeight: '500' } }, nextReminderText()),
        ]),
      ]),
      // PRD FR-10 R2：当天已有记账行为时不发送提醒
      h('p', {
        style: {
          fontSize: '10px', color: 'var(--c-muted)', textAlign: 'center', marginTop: '6px',
        },
      }, count > 0
        ? `今天已记 ${count} 笔，按规则今晚不再提醒`
        : '今天还没有记账，到点会提醒你记一笔'),
    ]),
    quickRow,
    h('div.row-between', {
      style: {
        marginTop: '12px', borderRadius: '12px', background: 'var(--c-bg)',
        padding: '8px 12px',
      },
    }, [
      h('span', { style: { fontSize: '10.5px', color: 'var(--c-ink-soft)' } }, '自定义时间'),
      h('input', {
        type: 'time',
        value: state.time,
        class: 'input',
        style: { width: 'auto', height: '32px', padding: '0 10px', fontSize: '12.5px' },
        onchange: (e) => setTime(e.target.value),
      }),
    ]),
  ]);
}

/** 重复周期 */
function buildDaysCard() {
  const chips = DAY_CHIPS.map((day) => {
    const on = state.days.includes(day.key);
    return h('button', {
      type: 'button',
      style: {
        padding: '8px 0', borderRadius: '10px', fontSize: '11px',
        background: on ? 'var(--c-brand)' : 'var(--c-bg)',
        color: on ? 'var(--c-on-brand)' : 'var(--c-muted)',
      },
      onclick: () => toggleDay(day.key),
    }, day.label);
  });

  return h('section.card', { style: { marginTop: '12px', padding: '16px' } }, [
    h('div.row-between', { style: { marginBottom: '12px' } }, [
      h('p', { style: { fontSize: '12.5px', fontWeight: '500' } }, '重复周期'),
      h('span', { style: { fontSize: '10.5px', color: 'var(--c-muted)' } }, '工作日优先'),
    ]),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' } }, chips),
    h('p', { style: { fontSize: '10px', color: 'var(--c-muted)', marginTop: '8px' } }, daysHint()),
  ]);
}

/** 辅助开关 + 提醒文案 */
function buildExtraCard() {
  const copy = REMINDER_COPIES[state.copyIndex % REMINDER_COPIES.length];

  return h('section.card', { style: { marginTop: '12px', overflow: 'hidden' } }, [
    h('div.setting-item', { style: { borderBottom: '1px solid var(--c-line-soft)' } }, [
      h('div', { style: { flex: '1', minWidth: 0 } }, [
        h('p', { style: { fontSize: '12.5px' } }, '二次提醒'),
        h('p', { style: { fontSize: '10px', color: 'var(--c-muted)', marginTop: '2px' } },
          '首次未记账时，23:00 再提醒一次'),
      ]),
      buildSwitch(state.second, toggleSecond, '二次提醒'),
    ]),
    h('div.setting-item', {}, [
      h('div', { style: { flex: '1', minWidth: 0 } }, [
        h('p', { style: { fontSize: '12.5px' } }, '提醒文案'),
        h('p', { style: { fontSize: '10px', color: 'var(--c-muted)', marginTop: '2px' } }, copy),
      ]),
      h('button', {
        type: 'button',
        style: {
          flexShrink: 0, fontSize: '10.5px', color: 'var(--c-brand)',
          border: '1px solid color-mix(in srgb, var(--c-brand) 22%, var(--c-surface))',
          borderRadius: '999px', padding: '4px 10px',
        },
        onclick: cycleCopy,
      }, '换一句'),
    ]),
  ]);
}

/** 底部说明 */
function buildTip() {
  const line = (text) => h('p', {
    style: { fontSize: '10px', color: 'var(--c-muted)', lineHeight: '1.6', marginTop: '4px' },
  }, text);

  return h('div', {
    style: {
      marginTop: '12px', borderRadius: '16px', background: 'var(--c-bg)',
      padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '8px',
    },
  }, [
    icon('ph:info', 'text-[13px]'),
    h('div', {}, [
      line('需要开启系统通知权限，提醒才能正常触达。若长时间未收到提醒，请检查手机的通知与免打扰设置。'),
      // PRD FR-10 R3 / R2
      line('仅本地通知，不上传服务器；当天已有记账行为时不会发送提醒。'),
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 动作
 * ------------------------------------------------------------------ */

function toggleMain() {
  state.enabled = !state.enabled;
  saveSettings();
  render();
}

function toggleSecond() {
  state.second = !state.second;
  saveSettings();
  render();
}

function setTime(time) {
  if (!/^\d{2}:\d{2}$/.test(time || '')) return;
  state.time = time;
  saveSettings();
  render();
  showToast(`提醒时间已设为 ${time}`);
}

function toggleDay(key) {
  state.days = state.days.includes(key)
    ? state.days.filter((d) => d !== key)
    : [...state.days, key];
  saveSettings();
  render();
}

function cycleCopy() {
  state.copyIndex = (state.copyIndex + 1) % REMINDER_COPIES.length;
  saveSettings();
  render();
}

/** 试听：模拟一次本地通知 */
function testReminder() {
  const copy = REMINDER_COPIES[state.copyIndex % REMINDER_COPIES.length];
  showToast(`小账本提醒：${copy}`);
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

let bodyRef = null;

function render() {
  clear(bodyRef);
  bodyRef.append(
    buildMainCard(),
    buildTimeCard(),
    buildDaysCard(),
    buildExtraCard(),
    buildTip(),
  );
}

function init() {
  loadSettings();

  const action = h('button', {
    type: 'button',
    style: { fontSize: '11px', color: 'var(--c-brand)' },
    onclick: testReminder,
  }, '试听');

  const page = createPage({
    title: '记账提醒',
    back: ROUTES.settings,
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
  }, h('button', {
    type: 'button',
    class: 'btn btn--primary btn--block',
    style: { fontSize: '13px' },
    onclick: () => {
      saveSettings();
      showToast('提醒设置已保存');
      setTimeout(() => go(ROUTES.settings), 600);
    },
  }, '保存提醒设置')));

  render();
}

init();
