/**
 * 页面：预算 —— PRD P-06 / FR-07
 * ------------------------------------------------------------------
 * 设置月度总预算并跟踪使用进度：环形仪表、状态徽标、剩余额度、
 * 建议日均支出、预算模拟器与 80% / 100% 阈值提醒（每月各提醒一次）。
 * 全部数据来自 store 实时计算，不含任何硬编码金额。
 */

import { h, icon, clear } from '../core/dom.js';
import { createPage } from '../components/shell.js';
import { createOverlay } from '../components/dialog.js';
import { showToast } from '../core/toast.js';
import { store } from '../core/store.js';
import { ROUTES, RULES } from '../core/constants.js';
import {
  formatAmount,
  formatMonthLabel,
  formatPercent,
  monthKey,
  shiftMonth,
} from '../core/format.js';

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** 预算健康度：<70% 绿 / 70%~90% 橙 / >90% 红（PRD FR-07） */
const LEVELS = {
  safe: {
    label: '花得很稳',
    icon: 'ph:leaf',
    color: 'var(--c-brand)',
    bg: 'var(--c-brand-soft)',
    text: 'var(--c-brand-deep)',
  },
  warn: {
    label: '注意节奏',
    icon: 'ph:warning',
    color: 'var(--c-warn)',
    bg: 'color-mix(in srgb, var(--c-warn) 14%, var(--c-surface))',
    text: 'var(--c-warn)',
  },
  danger: {
    label: '快超支了',
    icon: 'ph:warning-circle',
    color: 'var(--c-expense)',
    bg: 'color-mix(in srgb, var(--c-expense) 12%, var(--c-surface))',
    text: 'var(--c-expense)',
  },
};

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

const state = {
  month: monthKey(),
  /** 预算模拟器的模拟额度；null 表示与真实预算一致 */
  simAmount: null,
};

let bodyRef = null;

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 创建 SVG 元素（h() 只能创建 HTML 元素） */
function s(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    el.setAttribute(key, String(value));
  });
  return el;
}

/** 依据使用比例取健康度等级 */
function levelOf(percent) {
  if (percent > 90) return 'danger';
  if (percent >= 70) return 'warn';
  return 'safe';
}

/** 近 3 个月平均支出，用作预算建议值 */
function suggestBudget(mk) {
  const values = [-1, -2, -3]
    .map((offset) => store.summary(shiftMonth(mk, offset)).expense)
    .filter((value) => value > 0);
  if (!values.length) return 3000;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.max(1000, Math.round(average / 100) * 100);
}

/* ------------------------------------------------------------------ *
 * 预算仪表卡
 * ------------------------------------------------------------------ */

function buildGauge(budget) {
  const radius = 50;
  const width = 11;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.min(100, Math.max(0, budget.percent));
  const offset = circumference - (shown / 100) * circumference;
  // 颜色取 store 计算好的 level（PRD FR-07：<70% 绿 / 70%~90% 橙 / >90% 红）
  const level = LEVELS[budget.level || levelOf(budget.percent)];

  const svg = s('svg', {
    viewBox: '0 0 120 120',
    style: 'width:100%;height:100%;transform:rotate(-90deg);transform-origin:50% 50%;',
  });

  svg.append(s('circle', {
    cx: 60, cy: 60, r: radius, fill: 'none',
    stroke: 'var(--c-line-soft)', 'stroke-width': width,
  }));

  svg.append(s('circle', {
    cx: 60, cy: 60, r: radius, fill: 'none',
    stroke: level.color,
    'stroke-dasharray': circumference,
    'stroke-dashoffset': offset,
    'stroke-linecap': 'round',
    'stroke-width': width,
    style: 'transition:stroke-dashoffset .6s ease,stroke .3s ease;',
  }));

  return h('div', {
    style: { position: 'relative', width: '124px', height: '124px', flexShrink: '0' },
  }, [
    svg,
    h('div', {
      style: {
        position: 'absolute', inset: '0', pointerEvents: 'none',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      },
    }, [
      h('p', { style: { fontSize: '10px', color: 'var(--c-muted)' } }, '已使用'),
      h('p.num', {
        style: {
          fontSize: '22px', fontWeight: '600', lineHeight: '1', marginTop: '4px',
          color: (budget.level || levelOf(budget.percent)) === 'safe' ? 'var(--c-ink)' : level.color,
        },
      }, `${Math.round(budget.percent)}%`),
      h('p', { style: { fontSize: '9.5px', color: 'var(--c-muted)', marginTop: '4px' } },
        `¥${formatAmount(budget.spent)}`),
    ]),
  ]);
}

function metricRow(color, label, value) {
  return h('div.row-between', { style: { fontSize: '11.5px' } }, [
    h('span', { class: 'row gap-1.5', style: { color: 'var(--c-muted)' } }, [
      h('span', {
        style: {
          width: '8px', height: '8px', borderRadius: 'var(--r-full)',
          background: color, flexShrink: '0',
        },
      }),
      h('span', {}, label),
    ]),
    h('span.num', { style: { fontWeight: '600' } }, value),
  ]);
}

function buildAdvice(budget, daysLeft, dailyAdvice) {
  const level = budget.level || levelOf(budget.percent);
  if (level === 'danger') {
    return `已使用超过 90% 预算，本月仅剩 ${formatAmount(Math.max(0, budget.remain))} 额度，建议暂停非必要消费。`;
  }
  if (level === 'warn') {
    return `预算使用已超过 70%，建议控制餐饮与购物支出，优先完成固定账单，日均不超过 ¥${formatAmount(dailyAdvice)}。`;
  }
  if (daysLeft > 0) {
    return `按当前节奏，本月预计剩余 ¥${formatAmount(Math.max(0, budget.remain))}，建议继续保持日均 ¥${formatAmount(dailyAdvice)} 左右的支出。`;
  }
  return '本月已结束，预算进度将在下月 1 日自动重置。';
}

function buildBudgetCard(budget) {
  const daysLeft = store.daysLeftInMonth(state.month);
  const remain = budget.remain;
  const dailyAdvice = daysLeft > 0 && remain > 0 ? remain / daysLeft : 0;
  const level = LEVELS[budget.level || levelOf(budget.percent)];

  const pill = h('span', {
    class: 'row gap-1',
    style: {
      fontSize: '10.5px', fontWeight: '500', borderRadius: 'var(--r-full)',
      padding: '4px 10px', background: level.bg, color: level.text,
      flexShrink: '0',
    },
  }, [icon(level.icon, 'text-[11px]'), h('span', {}, level.label)]);

  return h('section.card', { style: { padding: 'var(--s-5) var(--s-5) var(--s-4)' } }, [
    h('div.row-between', {}, [
      h('div', {}, [
        h('p', { style: { fontSize: '11px', color: 'var(--c-muted)' } },
          `${formatMonthLabel(state.month)}总预算`),
        h('p.num', {
          style: { fontSize: '26px', fontWeight: '600', marginTop: '4px', lineHeight: '1' },
        }, `¥${formatAmount(budget.amount)}`),
      ]),
      pill,
    ]),
    h('div', {
      style: { display: 'flex', alignItems: 'center', gap: 'var(--s-4)', marginTop: 'var(--s-4)' },
    }, [
      buildGauge(budget),
      h('div.flex-1', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
        metricRow(level.color, '剩余可用',
          remain >= 0 ? `¥${formatAmount(remain)}` : `-¥${formatAmount(Math.abs(remain))}`),
        metricRow('var(--c-warn)', '还需消费天数', daysLeft > 0 ? `${daysLeft} 天` : '本月已结束'),
        metricRow('var(--c-muted)', '日均可用',
          daysLeft > 0 ? `¥${formatAmount(dailyAdvice)}` : '—'),
      ]),
    ]),
    h('div', {
      style: {
        marginTop: 'var(--s-4)', borderRadius: 'var(--r-md)',
        background: 'var(--c-bg)', padding: '10px 14px',
      },
    }, [
      h('p', {
        style: { fontSize: '10.5px', color: 'var(--c-ink-soft)', lineHeight: '1.7' },
      }, buildAdvice(budget, daysLeft, dailyAdvice)),
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 未设置预算的引导卡（PRD FR-07：默认不设置）
 * ------------------------------------------------------------------ */

function buildGuideCard(spent) {
  return h('section.card', { style: { padding: 'var(--s-6) var(--s-5)' } }, [
    h('div.empty', {}, [
      h('div.empty__icon', {}, icon('ph:target', 'text-[28px]')),
      h('p.empty__title', {}, '还没有设置月度预算'),
      h('p.empty__desc', {},
        `本月已支出 ¥${formatAmount(spent)}，设定预算后可随时跟踪进度并收到超支提醒`),
      h('button.btn.btn--primary', {
        type: 'button',
        style: { marginTop: 'var(--s-2)', padding: '0 var(--s-6)' },
        onclick: openBudgetSheet,
      }, '设置预算'),
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 预算健康度 + 模拟器
 * ------------------------------------------------------------------ */

function healthBox(range, desc, color, bg) {
  return h('div', { style: { borderRadius: 'var(--r-sm)', padding: '8px', background: bg } }, [
    h('p', { style: { fontSize: '10px', fontWeight: '500', color } }, range),
    h('p', { style: { fontSize: '9.5px', color: 'var(--c-ink-soft)', marginTop: '2px' } }, desc),
  ]);
}

function buildSimulatorCard(budget) {
  const spent = budget.spent;
  const min = 500;
  const max = Math.max(10000, Math.ceil((budget.amount * 2) / 1000) * 1000);
  const sim = Math.min(max, Math.max(min, state.simAmount ?? budget.amount));
  state.simAmount = sim;

  const simPercent = sim > 0 ? (spent / sim) * 100 : 0;
  const level = LEVELS[levelOf(simPercent)];

  const valueLabel = h('span.num', {
    style: { fontSize: '11.5px', fontWeight: '600', color: 'var(--c-ink-soft)' },
  }, `¥${formatAmount(sim)}`);

  const descLabel = h('p', {
    style: { fontSize: '10.5px', color: 'var(--c-muted)', marginTop: '6px', lineHeight: '1.6' },
  }, `按已用 ¥${formatAmount(spent)} 计算，使用率 ${formatPercent(simPercent)}`);

  const bar = h('div', {
    style: {
      height: '6px', width: `${Math.min(100, simPercent)}%`,
      borderRadius: 'var(--r-full)', background: level.color,
      transition: 'width .2s ease',
    },
  });

  const slider = h('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: '100',
    value: String(sim),
    'aria-label': '模拟预算金额',
    style: { width: '100%', marginTop: 'var(--s-3)', accentColor: 'var(--c-brand)' },
    oninput: (e) => {
      const next = Number(e.target.value);
      state.simAmount = next;
      const percent = next > 0 ? (spent / next) * 100 : 0;
      const nextLevel = LEVELS[levelOf(percent)];
      valueLabel.textContent = `¥${formatAmount(next)}`;
      descLabel.textContent =
        `按已用 ¥${formatAmount(spent)} 计算，使用率 ${formatPercent(percent)} · ${nextLevel.label}`;
      bar.style.width = `${Math.min(100, percent)}%`;
      bar.style.background = nextLevel.color;
    },
  });

  return h('section.card', { style: { marginTop: 'var(--s-3)', padding: '14px 16px' } }, [
    h('p', { style: { fontSize: '11.5px', fontWeight: '500' } }, '预算健康度'),
    h('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '8px' },
    }, [
      healthBox('＜70%', '节奏健康', LEVELS.safe.color, LEVELS.safe.bg),
      healthBox('70%-90%', '注意控制', LEVELS.warn.color, LEVELS.warn.bg),
      healthBox('＞90%', '接近超支', LEVELS.danger.color, LEVELS.danger.bg),
    ]),
    slider,
    h('div.row-between', { style: { marginTop: '4px' } }, [
      h('p', { style: { fontSize: '10px', color: 'var(--c-faint)' } }, '拖动可预览不同预算下的效果'),
      valueLabel,
    ]),
    descLabel,
    h('div', {
      style: {
        height: '6px', borderRadius: 'var(--r-full)',
        background: 'var(--c-line-soft)', marginTop: '8px', overflow: 'hidden',
      },
    }, [bar]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 超支预警提醒
 * ------------------------------------------------------------------ */

function buildAlertCard() {
  const enabled = store.getSettings().budgetAlertEnabled !== false;

  const toggle = h('button.switch', {
    type: 'button',
    role: 'switch',
    'aria-checked': String(enabled),
    'aria-label': '开关超支预警',
    class: enabled ? 'is-on' : '',
    onclick: () => {
      const next = !(store.getSettings().budgetAlertEnabled !== false);
      store.updateSettings({ budgetAlertEnabled: next });
      render();
    },
  }, h('span.switch__knob'));

  return h('section.card', { style: { marginTop: 'var(--s-3)', padding: '14px 16px' } }, [
    h('div.row-between', {}, [
      h('div.row.gap-2', {}, [
        icon('ph:bell-ringing', 'text-[16px]'),
        h('div', {}, [
          h('p', { style: { fontSize: '12px', fontWeight: '500' } }, '超支预警提醒'),
          h('p', { style: { fontSize: '10px', color: 'var(--c-muted)', marginTop: '2px' } },
            '预算使用达 80% 与 100% 时各提醒一次'),
        ]),
      ]),
      toggle,
    ]),
  ]);
}

/* ------------------------------------------------------------------ *
 * 设置预算弹层
 * ------------------------------------------------------------------ */

function openBudgetSheet() {
  const current = store.getBudget(state.month);
  const spent = current ? current.spent : store.summary(state.month).expense;
  const suggestion = suggestBudget(state.month);
  const initial = current ? current.amount : suggestion;

  const percentLabel = h('span.num', {
    style: { fontSize: '11.5px', fontWeight: '600', color: 'var(--c-brand)' },
  });

  const input = h('input', {
    type: 'number',
    min: '0',
    step: '100',
    inputmode: 'decimal',
    class: 'num',
    'aria-label': '月度预算金额',
    value: String(initial),
    style: {
      width: '100%', background: 'transparent', outline: 'none',
      fontSize: '26px', fontWeight: '600', color: 'var(--c-ink)',
    },
    oninput: (e) => updateSheetPercent(Number(e.target.value)),
  });

  function updateSheetPercent(value) {
    const percent = value > 0 ? (spent / value) * 100 : 0;
    percentLabel.textContent = formatPercent(percent);
    percentLabel.style.color = levelOf(percent) === 'danger'
      ? 'var(--c-expense)'
      : levelOf(percent) === 'warn' ? 'var(--c-warn)' : 'var(--c-brand)';
  }

  const quickValues = [0.8, 1, 1.2].map((factor) =>
    Math.max(100, Math.round((suggestion * factor) / 100) * 100));

  const quickRow = h('div', {
    style: { display: 'flex', gap: '8px', marginTop: '8px' },
  }, quickValues.map((value) => h('button', {
    type: 'button',
    style: {
      flex: '1', padding: '8px 0', borderRadius: 'var(--r-xs)',
      background: 'var(--c-bg)', fontSize: '11px', color: 'var(--c-ink-soft)',
    },
    onclick: () => {
      input.value = String(value);
      updateSheetPercent(value);
    },
  }, `¥${formatAmount(value)}`)));

  let closeSheet = () => {};

  const saveButton = h('button.btn.btn--primary', {
    type: 'button',
    style: { width: '100%', marginTop: 'var(--s-4)' },
    onclick: () => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value <= 0) {
        showToast('请输入有效金额');
        return;
      }
      if (value > RULES.MAX_AMOUNT) {
        showToast('金额超出上限');
        return;
      }

      const result = store.setBudget(state.month, value);
      if (!result.ok) {
        showToast(result.message || '保存失败');
        return;
      }

      // 预算变更后重置该月的提醒标记，允许按新额度重新触发一次
      const settings = store.getSettings();
      const alertState = { ...(settings.budgetAlertState || {}) };
      delete alertState[state.month];
      store.updateSettings({ budgetAlertState: alertState });

      state.simAmount = value;
      showToast('预算已更新');
      closeSheet();
      render();
      checkThresholds();
    },
  }, '保存预算');

  const content = h('div', { style: { padding: '0 20px 20px' } }, [
    h('div.row-between', {}, [
      h('p', { style: { fontSize: '15px', fontWeight: '600' } }, '设置月度总预算'),
      h('button', {
        type: 'button',
        'aria-label': '关闭',
        style: {
          width: '32px', height: '32px', borderRadius: 'var(--r-full)',
          background: 'var(--c-bg)', color: 'var(--c-ink-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
        onclick: close,
      }, icon('ph:x', 'text-[16px]')),
    ]),
    h('p', { style: { fontSize: '11px', color: 'var(--c-muted)', marginTop: '6px' } },
      `建议参考近 3 个月平均支出 ¥${formatAmount(suggestion)} 制定`),
    h('div', {
      style: {
        marginTop: 'var(--s-4)', borderRadius: 'var(--r-md)',
        background: 'var(--c-bg)', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: '6px',
      },
    }, [
      h('span', { style: { fontSize: '18px', color: 'var(--c-ink-soft)' } }, '¥'),
      input,
    ]),
    quickRow,
    h('div.row-between', { style: { marginTop: 'var(--s-4)', padding: '0 4px' } }, [
      h('span', { style: { fontSize: '11.5px', color: 'var(--c-ink-soft)' } }, '新预算下已用比例'),
      percentLabel,
    ]),
    saveButton,
  ]);

  const overlay = createOverlay((close) => {
    closeSheet = close;
    return content;
  });

  updateSheetPercent(initial);
  return overlay;
}

/* ------------------------------------------------------------------ *
 * 阈值提醒（PRD FR-07 R2：每月每个阈值仅提醒一次）
 * ------------------------------------------------------------------ */

function checkThresholds() {
  const budget = store.getBudget(state.month);
  if (!budget) return;

  const settings = store.getSettings();
  if (settings.budgetAlertEnabled === false) return;

  const flags = settings.budgetAlertState?.[state.month] || {};
  const notified80 = Boolean(flags.notified80 || budget.notified80);
  const notified100 = Boolean(flags.notified100 || budget.notified100);

  const next = { ...flags };
  let changed = false;

  if (budget.percent >= 100) {
    if (!notified100) {
      showToast(`预算已超支（${Math.round(budget.percent)}%），注意控制支出`);
      next.notified100 = true;
      changed = true;
    }
    if (!notified80) {
      next.notified80 = true;
      changed = true;
    }
  } else if (budget.percent >= 80 && !notified80) {
    showToast(`预算已使用 ${Math.round(budget.percent)}%，注意控制支出`);
    next.notified80 = true;
    changed = true;
  }

  if (changed) {
    store.updateSettings({
      budgetAlertState: {
        ...(settings.budgetAlertState || {}),
        [state.month]: next,
      },
    });
  }
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

function render() {
  clear(bodyRef);

  const budget = store.getBudget(state.month);

  if (!budget) {
    const summary = store.summary(state.month);
    bodyRef.append(buildGuideCard(summary.expense));
  } else {
    bodyRef.append(
      buildBudgetCard(budget),
      buildSimulatorCard(budget),
      buildAlertCard()
    );
  }

  bodyRef.append(h('a.row.gap-1.5', {
    href: ROUTES.statistics,
    style: {
      justifyContent: 'center', padding: '16px 0',
      fontSize: '12px', color: 'var(--c-brand)',
    },
  }, [icon('ph:chart-donut', 'text-[14px]'), h('span', {}, '查看本月消费统计')]));
}

function init() {
  const action = h('button.app-header__action', {
    type: 'button',
    'aria-label': '编辑预算',
    onclick: openBudgetSheet,
  }, icon('ph:pencil-simple', 'text-[17px]'));

  const page = createPage({
    title: '预算',
    subtitle: `${formatMonthLabel(state.month)} · 月度预算`,
    back: ROUTES.home,
    action,
  });
    // 未登录时已被重定向到登录页
    if (!page) return;

  bodyRef = h('div', {});
  page.body.append(bodyRef);

  render();
  checkThresholds();
}

init();
