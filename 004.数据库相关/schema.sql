-- =====================================================================
-- 随手记账 · 数据库建库建表脚本（DDL）
-- ---------------------------------------------------------------------
-- 依据：001.产品经理PRD/PRD-个人消费记账产品需求文档.md（第六节）
--       003.前端代码/assets/js/core/{store,auth}.js 与 assets/data/seed.js
--
-- 引擎要求：MySQL 8.0+（用到 JSON 列与 CHECK 约束，8.0.16+ 才强制执行 CHECK）
-- 字符集：utf8mb4（分类图标、头像为 emoji，必须 4 字节）
--
-- 执行：mysql -u root -p < schema.sql
-- =====================================================================

CREATE DATABASE IF NOT EXISTS ledger
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE ledger;

-- ---------------------------------------------------------------------
-- 1. 账号表（users）
--    对应前端 auth.js 的 accounts[]（localStorage key = ledger:v1:auth）
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id             VARCHAR(36)  NOT NULL                COMMENT '主键（UUID 字符串，对齐 PRD 6.1）',
  account        VARCHAR(20)  NOT NULL                COMMENT '登录账号：4~20 位字母/数字/下划线，或 11 位手机号',
  nickname       VARCHAR(12)  NOT NULL                COMMENT '昵称（≤12 字）',
  avatar         VARCHAR(16)  NOT NULL DEFAULT '🙂'   COMMENT '头像 emoji',
  password_hash  VARCHAR(255) NOT NULL                COMMENT '密码哈希；生产建议 bcrypt/argon2（255 足够），当前前端为 SHA-256 hex（64 位）',
  password_salt  VARCHAR(64)  NOT NULL                COMMENT '密码盐；当前前端为 32 位 hex 随机盐',
  last_login_at  DATETIME     NULL                    COMMENT '最近登录时间',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_account (account)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = '账号表';

-- ---------------------------------------------------------------------
-- 2. 登录会话表（sessions）
--    对应前端 auth.js 的 session（单会话；服务端化后支持多端多会话）
-- ---------------------------------------------------------------------
CREATE TABLE sessions (
  id          VARCHAR(36) NOT NULL COMMENT '会话主键（UUID）',
  user_id     VARCHAR(36) NOT NULL COMMENT '所属账号',
  login_at    DATETIME    NOT NULL COMMENT '登录时间',
  expires_at  DATETIME    NOT NULL COMMENT '过期时间（前端默认 30 天）',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_user (user_id),
  KEY idx_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = '登录会话表';

-- ---------------------------------------------------------------------
-- 3. 分类表（categories）
--    对应前端 store.js 的 categories[]（12 支出 + 7 收入预设分类 + 自定义）
--
-- 设计决策：预设分类按「每个用户复制一份」落地（注册时写入 19 条），
--   is_preset 标记区分预设/自定义，与前端「单一分类列表」模型完全一致，
--   且天然支持 PRD FR-08 R1「预设分类可改名/隐藏但不可删除」的按用户个性化。
-- ---------------------------------------------------------------------
CREATE TABLE categories (
  id          VARCHAR(36)                 NOT NULL COMMENT '主键（UUID）',
  user_id     VARCHAR(36)                 NOT NULL COMMENT '所属账号',
  name        VARCHAR(6)                  NOT NULL COMMENT '分类名（≤6 字，PRD FR-08）',
  type        ENUM('expense','income')    NOT NULL COMMENT '收支类型：expense=支出 / income=收入',
  icon        VARCHAR(16)                 NOT NULL DEFAULT '📦' COMMENT '图标（emoji 或图标标识）',
  color       CHAR(7)                     NOT NULL DEFAULT '#F1F3F4' COMMENT '颜色值（#RRGGBB）',
  sort_order  INT                         NOT NULL DEFAULT 0 COMMENT '排序权重（记账面板按此升序展示）',
  is_preset   TINYINT(1)                  NOT NULL DEFAULT 0 COMMENT '是否预设分类（1=预设不可删，0=自定义）',
  is_hidden   TINYINT(1)                  NOT NULL DEFAULT 0 COMMENT '是否隐藏（分类管理可隐藏预设分类）',
  created_at  DATETIME                    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at  DATETIME                    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_type_name (user_id, type, name),     -- 同类型下分类名唯一
  KEY idx_user_type_sort (user_id, type, sort_order),     -- 按类型+排序取分类列表
  CONSTRAINT fk_categories_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = '收支分类表';

-- ---------------------------------------------------------------------
-- 4. 流水表（transactions）
--    对应前端 store.js 的 transactions[]（软删除）
-- ---------------------------------------------------------------------
CREATE TABLE transactions (
  id           VARCHAR(36)              NOT NULL COMMENT '主键（UUID）',
  user_id      VARCHAR(36)              NOT NULL COMMENT '所属账号',
  type         ENUM('expense','income') NOT NULL COMMENT '收支类型：expense=支出 / income=收入',
  amount       DECIMAL(10,2)            NOT NULL COMMENT '金额（PRD FR-01 R1：上限 9,999,999.99）',
  category_id  VARCHAR(36)              NOT NULL COMMENT '分类 ID',
  note         VARCHAR(50)              NULL COMMENT '备注（≤50 字，PRD FR-01 R5）',
  occurred_at  DATETIME                 NOT NULL COMMENT '账目发生时间（PRD：过去 5 年内 ~ 今天）',
  is_deleted   TINYINT(1)               NOT NULL DEFAULT 0 COMMENT '软删除标记（PRD FR-03）',
  created_at   DATETIME                 NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at   DATETIME                 NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_user_occurred (user_id, occurred_at),      -- 流水列表/统计按月取数主路径
  KEY idx_user_type (user_id, type),                 -- 按类型筛选
  KEY idx_category (category_id),                    -- 按分类取明细（FR-06）
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_tx_category FOREIGN KEY (category_id)
    REFERENCES categories (id),
  CONSTRAINT chk_tx_amount CHECK (amount > 0 AND amount <= 9999999.99)  -- 需 MySQL 8.0.16+
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = '流水表';

-- ---------------------------------------------------------------------
-- 5. 预算表（budgets）
--    对应前端 store.js 的 budgets[]（按月一条，PRD FR-07）
-- ---------------------------------------------------------------------
CREATE TABLE budgets (
  id           VARCHAR(36)   NOT NULL COMMENT '主键（UUID）',
  user_id      VARCHAR(36)   NOT NULL COMMENT '所属账号',
  month        CHAR(7)       NOT NULL COMMENT '生效月份（YYYY-MM，PRD FR-07 R1：自然月）',
  amount       DECIMAL(10,2) NOT NULL COMMENT '月度总预算金额',
  notified_80  TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '80% 阈值是否已提醒（每月仅一次，PRD FR-07 R2）',
  notified_100 TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '100% 阈值是否已提醒',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_month (user_id, month),   -- 每用户每月最多一条预算
  CONSTRAINT fk_budgets_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_budget_amount CHECK (amount > 0)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = '月度预算表';

-- ---------------------------------------------------------------------
-- 6. 导出记录表（export_history）
--    对应前端 store.js 的 exportHistory[]（PRD FR-09）
--    注：前端字段名 range / rows / size 与 MySQL 保留字冲突，此处已重命名
-- ---------------------------------------------------------------------
CREATE TABLE export_history (
  id                 VARCHAR(36)  NOT NULL COMMENT '主键（UUID）',
  user_id            VARCHAR(36)  NOT NULL COMMENT '所属账号',
  export_range       VARCHAR(32)  NOT NULL COMMENT '导出范围名称（如「本月」「近三个月」）',
  export_range_detail VARCHAR(128) NULL COMMENT '导出范围明细（如「2026-10-01 至 2026-10-24」）',
  file_name          VARCHAR(128) NOT NULL COMMENT '导出文件名（如 随手记账_2026-10.csv）',
  row_count          INT          NOT NULL DEFAULT 0 COMMENT '导出行数',
  file_size          VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '文件大小（展示用，如 18.4 KB）',
  exported_at        DATETIME     NOT NULL COMMENT '导出时间',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_user_exported (user_id, exported_at),
  CONSTRAINT fk_export_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = '数据导出记录表';

-- ---------------------------------------------------------------------
-- 7. 设置表（settings）
--    对应前端 store.js 的 settings（每用户一行）
--    注：last_category_expense / income 指向 categories.id；
--        分类被删除时置 NULL（前端 getCategory 对缺失分类会回退兜底分类）
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  user_id                VARCHAR(36)  NOT NULL COMMENT '所属账号（主键，一人一行）',
  theme                  VARCHAR(10)  NOT NULL DEFAULT 'light' COMMENT '主题偏好（light/dark，V1.0 仅存偏好）',
  reminder_enabled       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '记账提醒开关（PRD FR-10，默认开启）',
  reminder_time          VARCHAR(5)   NOT NULL DEFAULT '22:00' COMMENT '提醒时间 HH:mm',
  reminder_days          JSON         NOT NULL COMMENT '提醒星期数组，如 ["1","2","3","4","5","6","0"]（0=周日）',
  last_category_expense  VARCHAR(36)  NULL COMMENT '上次使用的支出分类（PRD FR-01 R3）',
  last_category_income   VARCHAR(36)  NULL COMMENT '上次使用的收入分类',
  privacy_accepted       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否已同意隐私政策（PRD 五：隐私合规）',
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (user_id),
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_settings_last_exp FOREIGN KEY (last_category_expense)
    REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_settings_last_inc FOREIGN KEY (last_category_income)
    REFERENCES categories (id) ON DELETE SET NULL
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = '用户设置表';

-- =====================================================================
-- 校验：查看已建表
--   SHOW TABLES;
--   SHOW CREATE TABLE transactions\G
-- =====================================================================
