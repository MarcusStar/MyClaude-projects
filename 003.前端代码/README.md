# 随手记账 · 前端代码

「随手记账」个人消费记录与管理产品的 V1.0（MVP）前端实现。

- **需求依据**：`001.产品经理PRD/PRD-个人消费记账产品需求文档.md`
- **视觉依据**：`002.产品原型/expense-tracker/`（墨刀原型稿）

---

## 快速开始

```bash
cd 003.前端代码
node serve.js          # 默认 http://localhost:5173
node serve.js 8080     # 指定端口
```

> ES Module 在 `file://` 协议下会被浏览器的 CORS 策略拦截，
> 因此**必须**通过本地服务器访问，不能直接双击 HTML 打开。
> `serve.js` 是零依赖的原生 Node 实现，无需 `npm install`。

| 地址 | 页面 |
| --- | --- |
| <http://localhost:5173/> | 自动跳转到流水首页 `pages/home.html` |
| <http://localhost:5173/index.html> | 页面索引（全部页面的导航地图） |

> **首次打开会进入登录页**：本版本新增了账号门禁，第一次使用需要先注册一个本机账号
> （昵称 + 账号/手机号 + 密码，并勾选同意协议）。注册后即可进入应用。
> 在「设置 → 账号」里可以改昵称、改密码、退出登录。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 视图 | 原生 HTML + Tailwind Play CDN |
| 脚本 | 原生 ES Module（无打包器、无构建） |
| 样式 | CSS 变量设计令牌 + 语义化组件类 |
| 图标 | Iconify（Phosphor 图标集） |
| 数据 | localStorage（key `ledger:v1`），不可用时自动降级为内存 |

---

## 目录结构

```
003.前端代码/
├── index.html          页面索引（导航地图；根路径会自动跳转到首页）
├── serve.js            零依赖本地静态服务器
├── README.md
├── docs/
│   └── 开发指南.md      架构契约：分层、API 速查、代码风格
├── pages/              页面入口 HTML（每个页面一个文件）
│   ├── home.html                    P-01 流水列表（首页，根路径默认落地页）
│   ├── transaction-detail.html      P-03 流水详情
│   ├── statistics.html              P-04 月度统计
│   ├── category-detail.html         P-05 分类流水明细
│   ├── budget.html                  P-06 预算
│   ├── categories.html              P-07 分类管理
│   ├── search.html                  P-08 搜索与筛选
│   ├── settings.html                P-09 设置
│   ├── export.html                  P-10 数据导出
│   ├── export-history.html          导出记录
│   └── reminder.html                FR-10 记账提醒
├── assets/
│   ├── css/
│   │   ├── tokens.css               设计令牌
│   │   ├── base.css                 Reset 与排版
│   │   └── components.css           组件类
│   ├── data/
│   │   └── seed.js                  种子数据
│   └── js/
│       ├── core/                    constants / format / dom / storage / toast / store
│       ├── components/              shell / tab-bar / dialog / record-sheet / transaction-item
│       └── pages/                   各页面业务脚本
└── docs/
```

---

## 页面与需求对照

| 页面 | PRD 编号 | 关联需求 | 文件 |
| --- | --- | --- | --- |
| 登录 / 注册 | P-11 | 本机账号 · 隐私同意 | `pages/login.html` |
| 流水列表（首页） | P-01 | FR-03 | `pages/home.html` |
| 记账面板（半屏弹层） | P-02 | FR-01 / FR-02 / FR-05 | `components/record-sheet.js` |
| 流水详情 | P-03 | FR-05 | `pages/transaction-detail.html` |
| 月度统计 | P-04 | FR-06 | `pages/statistics.html` |
| 分类流水明细 | P-05 | FR-06 | `pages/category-detail.html` |
| 预算 | P-06 | FR-07 | `pages/budget.html` |
| 分类管理 | P-07 | FR-08 | `pages/categories.html` |
| 筛选 / 搜索 | P-08 | FR-04 | `pages/search.html` |
| 设置 | P-09 | FR-09 / FR-10 | `pages/settings.html` |
| 数据导出 | P-10 | FR-09 | `pages/export.html` |
| 导出记录 | — | FR-09 | `pages/export-history.html` |
| 记账提醒 | — | FR-10 | `pages/reminder.html` |

---

## 导航关系

```
                    ┌──────────────┐
                    │  index.html  │  页面索引
                    └──────┬───────┘
           ┌───────────────┼───────────────┬──────────────┐
           ▼               ▼               ▼              ▼
      ┌─────────┐   ┌─────────────┐  ┌──────────┐  ┌──────────────┐
      │  首页    │   │   月度统计   │  │   设置    │  │  记账面板 ⓧ   │
      │ home    │   │ statistics  │  │ settings │  │ record-sheet │
      └────┬────┘   └──────┬──────┘  └────┬─────┘  └──────────────┘
           │               │              │
   ┌───────┼───────┐       │       ┌──────┼──────┬─────────┐
   ▼       ▼       ▼       ▼       ▼      ▼      ▼         ▼
搜索筛选  流水详情 预算  分类明细 分类管理 数据导出 导出记录 记账提醒
search  detail  budget category  categories export  export-  reminder
                -detail                     history
```

底部三个主 Tab：**明细 / 统计 / 设置**（PRD 7.1），悬浮「+」按钮全局常驻记账入口。

---

## 数据层

账目与账号是**两套独立**的存储，互不影响：

| 存储键 | 内容 | 清空影响 |
| --- | --- | --- |
| `ledger:v1` | 账目、分类、预算、导出记录、设置 | 「清除全部数据」只清这一份，账号保留 |
| `ledger:v1:auth` | 账号、密码哈希、登录会话 | 退出登录只清会话，账号保留 |

所有页面共用 `assets/js/core/store.js` 一份账目数据，写入即持久化到 `localStorage`：

| 集合 | 说明 |
| --- | --- |
| `transactions` | 流水（软删除，`isDeleted` 标记） |
| `categories` | 分类（预设 19 个：12 支出 + 7 收入） |
| `budgets` | 按月预算（`YYYY-MM`），含 80% / 100% 提醒标记 |
| `exportHistory` | 导出记录 |
| `settings` | 提醒时间、上次使用分类、隐私同意状态等 |

首次启动写入 `assets/data/seed.js` 的种子数据（201 条流水，覆盖 2026 年 8–10 月），
各月合计与原型口径一致：

| 月份 | 支出 | 收入 | 结余 |
| --- | --- | --- | --- |
| 2026-10 | ¥ 4,286.40 | ¥ 7,707.00 | ¥ 3,420.60 |
| 2026-09 | ¥ 3,961.20 | ¥ 7,480.00 | ¥ 3,518.80 |

**恢复种子数据**：在浏览器控制台执行 `localStorage.removeItem('ledger:v1')` 后刷新页面。

**重置账号**：执行 `localStorage.removeItem('ledger:v1:auth')` 后刷新，会重新回到注册页。

**清除全部数据**：设置页 →「清除全部数据」会删除全部流水、自定义分类、预算与导出记录，
但保留 19 个预设分类——否则清空后将无法再记一笔账。

---

## 开发约定

完整的分层规则、API 速查与代码风格见 **[`docs/开发指南.md`](docs/开发指南.md)**。

核心三条：

1. 页面脚本不直接读写 `localStorage`，一律通过 `core/store.js`；
2. 不硬编码颜色与路径，分别用 `var(--c-*)` 与 `ROUTES`；
3. 通用视觉单元先查 `components.css`，没有再新增组件类。

---

## 已知限制

- 未接入后端，账号与数据均仅存本地浏览器；清空浏览器数据会丢失账目（可通过「数据导出」备份 CSV）。
- 密码用「随机盐 + SHA-256」存储，演示级强度，不是 bcrypt / Argon2 这类专用 KDF；也没有失败次数限制。
- 深色模式为占位开关，仅保存偏好，尚未实现主题切换。
- 记账提醒只保存设置，未接入 `Notification` API 的真实定时推送。
- 预算只支持「月度总预算」，PRD 要求的分类预算不在本期范围。
- Iconify 与 Tailwind 走公共 CDN，首次打开需要联网；离线环境下图标与工具类样式会缺失。
