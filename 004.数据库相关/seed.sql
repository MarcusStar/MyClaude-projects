-- =====================================================================
-- 随手记账 · 参考种子数据（Seed）
-- ---------------------------------------------------------------------
-- 对应前端 assets/data/seed.js 的 SEED_CATEGORIES（19 个预设分类）。
--
-- 预设分类属于「应用出厂配置」：真实系统中应在用户注册时，由应用层
-- 为每个新账号复制一份（is_preset = 1）。本脚本用一个演示账号演示该过程。
--
-- 前置：已执行 schema.sql 建库建表。
-- 执行：mysql -u root -p ledger < seed.sql
-- =====================================================================

USE ledger;

-- 1) 演示账号（密码哈希为占位，实际由应用层用「盐 + 哈希」生成后写入）
INSERT INTO users (id, account, nickname, avatar, password_hash, password_salt)
VALUES (
  'acc_demo_0001',
  'demo',
  '演示用户',
  '🙂',
  '<此处为应用层生成的密码哈希>',
  '<此处为应用层生成的盐>'
);

-- 2) 为该账号写入 19 个预设分类（12 支出 + 7 收入，PRD 4.4）
SET @user_id := 'acc_demo_0001';

INSERT INTO categories (id, user_id, name, type, icon, color, sort_order, is_preset, is_hidden) VALUES
  -- 支出（expense）
  ('cat_e_01', @user_id, '餐饮',     'expense', '🍚', '#FFF1E4', 0,  1, 0),
  ('cat_e_02', @user_id, '购物',     'expense', '🛍️', '#FFEDEF', 1,  1, 0),
  ('cat_e_03', @user_id, '居住',     'expense', '🏠', '#EAF6F2', 2,  1, 0),
  ('cat_e_04', @user_id, '娱乐',     'expense', '🎮', '#F2EEFF', 3,  1, 0),
  ('cat_e_05', @user_id, '零食饮料', 'expense', '🧋', '#FFF3E6', 4,  1, 0),
  ('cat_e_06', @user_id, '服饰',     'expense', '👕', '#FDEEF3', 5,  1, 0),
  ('cat_e_07', @user_id, '交通',     'expense', '🚌', '#E9F1FF', 6,  1, 0),
  ('cat_e_08', @user_id, '通讯',     'expense', '📱', '#EEF2FF', 7,  1, 0),
  ('cat_e_09', @user_id, '医疗',     'expense', '💊', '#EAF7F4', 8,  1, 0),
  ('cat_e_10', @user_id, '学习',     'expense', '📚', '#FFF6E0', 9,  1, 0),
  ('cat_e_11', @user_id, '人情',     'expense', '🎁', '#FFEDF5', 10, 1, 0),
  ('cat_e_12', @user_id, '其他',     'expense', '📦', '#F1F3F4', 11, 1, 0),
  -- 收入（income）
  ('cat_i_01', @user_id, '工资',     'income', '💰', '#E7F4EC', 0,  1, 0),
  ('cat_i_02', @user_id, '奖金',     'income', '🏅', '#FFF6E0', 1,  1, 0),
  ('cat_i_03', @user_id, '理财收益', 'income', '📈', '#E9F1FF', 2,  1, 0),
  ('cat_i_04', @user_id, '兼职',     'income', '💻', '#F2EEFF', 3,  1, 0),
  ('cat_i_05', @user_id, '红包',     'income', '🧧', '#FFEDEF', 4,  1, 0),
  ('cat_i_06', @user_id, '报销',     'income', '🧾', '#EAF6F2', 5,  1, 0),
  ('cat_i_07', @user_id, '其他',     'income', '📦', '#F1F3F4', 6,  1, 0);
