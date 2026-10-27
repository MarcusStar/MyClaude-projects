# 数据库相关

「随手记账」的关系型数据库设计与建库脚本。设计依据为
`001.产品经理PRD/PRD-个人消费记账产品需求文档.md`（第六节「数据模型设计」）与
`003.前端代码/`（`assets/js/core/store.js`、`auth.js`、`assets/data/seed.js`）。

## 文件清单

| 文件 | 内容 |
| --- | --- |
| [数据库设计文档.md](数据库设计文档.md) | 表结构设计、ER 关系、字段与前端数据模型映射、设计决策说明 |
| [schema.sql](schema.sql) | 建库 + 建表脚本（DDL，含索引、外键、注释） |
| [seed.sql](seed.sql) | 预设分类等参考种子数据（对应前端 `seed.js` 的 19 个预设分类） |

## 快速使用

```bash
mysql -u root -p < schema.sql      # 建库建表
mysql -u root -p ledger < seed.sql # 写入演示账号与预设分类（可选）
```

## 技术选型速览

- **引擎**：MySQL 8.0（InnoDB）
- **字符集**：`utf8mb4` / `utf8mb4_unicode_ci`（分类图标与头像为 emoji，必须 4 字节）
- **主键**：`VARCHAR(36)` UUID 字符串（对齐 PRD 6.1，兼容离线优先 + 云同步）

> 如需纯本地部署（无服务端），同一套逻辑模型可迁移到 SQLite，见设计文档「引擎与部署说明」。
