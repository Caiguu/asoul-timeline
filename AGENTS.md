# A-SOUL Timeline

A-SOUL 女团动态时间线 + 直播日程日历。前后端分离 Monorepo，本地 SQLite 开发，Cloudflare Free Plan 部署。

## 架构

```
本地电脑 (cron 定时)          Cloudflare (Free Plan)
┌───────────────┐            ┌─────────────┐  ┌──────────────┐
│  crawler(Bun) │──写SQLite─►│ (开发期本地) │  │ Pages: Astro │
│  抓B站→LLM分类│            │  SQLite文件  │  │ Workers:Hono │
└───────────────┘            └─────────────┘  └──────┬───────┘
        │                                            │
        └──(部署期)通过D1 REST写入─────────────► D1(SQLite)◄─Workers读
```

- **开发期**：爬虫写本地 SQLite 文件，API 读同一文件，零外部依赖。
- **部署期**：爬虫(本地/VPS)通过 D1 REST API 写入，Workers 用 D1 binding 读。

## 技术栈

| 层 | 选型 |
|---|---|
| Monorepo | Bun workspaces |
| 前端 | Astro + SolidJS islands → Cloudflare Pages |
| API | Hono → Cloudflare Workers |
| 数据库 | 本地 bun:sqlite / 生产 Cloudflare D1 + Drizzle ORM |
| 爬虫 | Bun + TypeScript（本地 cron） |
| LLM | DeepSeek（文本）+ 豆包 Seed1.8（识图） |

## 目录

```
apps/
  web/      Astro 前端
  api/      Hono API
packages/
  shared/   共享类型
  db/       Drizzle schema + 迁移
  crawler/  爬虫脚本
```

## 开发

```bash
# 1. 安装依赖
bun install

# 2. 复制环境变量
cp .env.example .env  # 按需填写 LLM key

# 3. 初始化本地数据库（生成表结构）
bun db:push

# 4. 抓取动态（填好 .env 的 LLM key 后）
bun crawl

# 5. 启动 API + 前端
bun dev:api
bun dev:web
```

## 常用命令

- `bun crawl` 抓取并入库
- `bun crawl:dry` 抓取但不入库（调试用）
- `bun dev:api` 本地 API (Hono, 端口 8787)
- `bun dev:web` 前端 dev server
- `bun db:push` 同步 schema 到本地 SQLite
- `bun typecheck` 类型检查
