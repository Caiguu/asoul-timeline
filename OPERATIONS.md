# A-SOUL Timeline 运维手册

## 服务启动（开机/重启后）

```bash
cd ~/Desktop/asoul_timeline/packages/crawler
nohup /bin/bash ~/Desktop/asoul_timeline/scripts/start-daemon.sh > /tmp/asoul-daemon.log 2>&1 & disown

cd ~/Desktop/asoul_timeline/apps/api
bun run src/index.ts > /dev/null 2>&1 & disown

cd ~/Desktop/asoul_timeline/apps/web
bun run dev > /dev/null 2>&1 & disown
```

## 常用命令

### 进程状态

```bash
# daemon 是否在跑（有输出即在运行）
ps aux | grep "daemon.ts" | grep -v grep

# caffeinate 防睡眠是否生效（合盖不睡需要它）
ps aux | grep "caffeinate" | grep -v grep

# API 是否在跑
lsof -i:8787

# 前端是否在跑
lsof -i:4321
```

### 日志查看

```bash
# 实时追踪 daemon 日志（最常用）
tail -f /tmp/asoul-daemon.log

# 查看最近 20 行
tail -20 /tmp/asoul-daemon.log

# 查看下次抓取时间
grep "next tick" /tmp/asoul-daemon.log | tail -1

# 查看最近一次抓取结果
grep -E "tick start|crawl|sync" /tmp/asoul-daemon.log | tail -6

# 找历史错误
grep "FAILED\|TIMEOUT\|error" /tmp/asoul-daemon.log | tail -10
```

### 服务验证

```bash
# API 健康检查
curl -s http://localhost:8787/api/health

# 本地数据条数
cd ~/Desktop/asoul_timeline && bun -e 'import { Database } from "bun:sqlite"; const db = new Database("data/local.db", {readonly:true}); console.log("dynamics:", db.query("SELECT count(*) n FROM dynamics").get().n)'

# 远程数据条数
turso db shell asoul-timeline "SELECT count(*) FROM dynamics;"
```

## 停止服务

```bash
# 停 daemon（连同 caffeinate）
pkill -f "daemon.ts" && pkill -f "caffeinate"

# 停 API
lsof -ti:8787 | xargs kill -9

# 停前端
lsof -ti:4321 | xargs kill -9
```

## 手动触发

```bash
# 立即抓取一次（不启动 daemon）
cd ~/Desktop/asoul_timeline && bun crawl

# 立即增量同步到远程
cd ~/Desktop/asoul_timeline && bun sync:remote

# 更新直播状态
cd ~/Desktop/asoul_timeline/packages/crawler && bun --env-file=../../.env run src/update-live-status.ts
```

## 部署前端/API 到 Cloudflare

```bash
# 部署前端（改了 web/ 代码后）
# 注意：--branch main 让部署进入生产环境（项目 production branch 是 main，
# 不加此参数且本地 git 分支为 master 时会变成 Preview 部署，线上不更新！）
cd ~/Desktop/asoul_timeline/apps/web
rm -rf dist && PUBLIC_API_BASE="" bun run build
export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897 all_proxy=socks5://127.0.0.1:7897
wrangler pages deploy dist/ --project-name asoul-timeline --branch main --commit-dirty=true

# 部署 API（改了 api/ 代码后）
export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897 all_proxy=socks5://127.0.0.1:7897
cd ~/Desktop/asoul_timeline/apps/api && wrangler deploy
```

## 删除动态数据（测试用）

```bash
# 本地删最新 N 条（改 LIMIT 数字）
cd ~/Desktop/asoul_timeline && bun -e '
import { Database } from "bun:sqlite";
const db = new Database("data/local.db");
const rows = db.query("SELECT id FROM dynamics ORDER BY created_at DESC LIMIT 3").all();
for (const r of rows) { db.run("DELETE FROM dynamics WHERE id=?", [r.id]); db.run("DELETE FROM live_schedules WHERE dynamic_id=?", [r.id]); }
console.log("deleted:", rows.length)'

# 远程删（替换 id 列表）
turso db shell asoul-timeline "DELETE FROM dynamics WHERE id IN ('id1','id2','id3'); DELETE FROM live_schedules WHERE dynamic_id IN ('id1','id2','id3');"
```

## 架构速览

```
本地 Mac (daemon, 30min/次)              Cloudflare Free
┌────────────────────────┐              ┌──────────────────┐
│ update-live-status      │              │ Workers (Hono)    │
│ crawl (Playwright+B站)  │──增量推送──►│  读 Turso         │
│ sync-remote (增量)      │              │ /api/*            │
│  caffeinate -s 防合盖睡  │              └────────┬─────────┘
└────────────────────────┘                       │
                                      Pages (Astro 前端)
                                      + Turso (libsql)
```

## 注意事项

- `caffeinate -s` 仅在**接电源**时阻止合盖睡眠，电池模式会强制睡眠
- 同步是**增量**的（`data/.last-sync` 记时间戳），删掉该文件会触发全量
- daemon tick 前会自动清理残留 chromium 僵尸进程
- 超时保护：live 20s / crawl 3min / sync 60s
