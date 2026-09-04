// 增量同步：只推送上次同步后的新数据到 Turso
// 用法: bun --env-file=../../.env run src/sync-remote.ts
import { createClient } from "@libsql/client";
import { Database } from "bun:sqlite";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const MONOREPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../");
const localDbPath = isAbsolute(process.env.LOCAL_DB_PATH ?? "")
  ? process.env.LOCAL_DB_PATH!
  : resolve(MONOREPO_ROOT, process.env.LOCAL_DB_PATH ?? "data/local.db");

const SYNC_FILE = resolve(MONOREPO_ROOT, "data", ".last-sync");
const TURSO_URL = process.env.TURSO_DB_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("[sync-remote] 请设置 TURSO_DB_URL 和 TURSO_AUTH_TOKEN 环境变量");
  process.exit(1);
}

const localDb = new Database(localDbPath);
const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

// 带重试的 execute：网络瞬断（ECONNRESET 等）自动重试
async function execWithRetry(stmt: { sql: string; args?: any[] }, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await turso.execute(stmt);
    } catch (e: any) {
      const retryable = ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "UND_ERR_SOCKET"].some(
        (code) => e?.code === code || String(e?.message).includes(code),
      );
      if (!retryable || i === retries) throw e;
      console.log(`[sync-remote] 网络错误 (${e?.code ?? e?.message})，重试 ${i + 1}/${retries}...`);
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

// 读取上次同步时间戳（不存在则全量）
let lastSync = 0;
if (existsSync(SYNC_FILE)) {
  lastSync = parseInt(readFileSync(SYNC_FILE, "utf-8").trim()) || 0;
}
const now = Date.now();

console.log(`[sync-remote] 增量同步 (last=${lastSync ? new Date(lastSync).toLocaleString("zh-CN") : "全量"})`);

// 创建表（幂等）
for (const sql of [
  `CREATE TABLE IF NOT EXISTS accounts (uid INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dynamics (id TEXT PRIMARY KEY, uid INTEGER NOT NULL REFERENCES accounts(uid), type TEXT NOT NULL, bili_type TEXT NOT NULL, text TEXT NOT NULL, rich_text TEXT NOT NULL, raw TEXT NOT NULL, images TEXT NOT NULL, author_name TEXT NOT NULL, author_face TEXT, author_url TEXT, dynamic_url TEXT NOT NULL, video_cover TEXT, video_title TEXT, forward TEXT, reserve TEXT, schedule_entries TEXT, live_time INTEGER, live_title TEXT, created_at INTEGER NOT NULL, fetched_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS live_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, dynamic_id TEXT NOT NULL REFERENCES dynamics(id), uid INTEGER NOT NULL, rid INTEGER NOT NULL UNIQUE, title TEXT NOT NULL, live_time INTEGER NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, live_type TEXT, participants TEXT, live_room_url TEXT, source TEXT)`,
  `CREATE TABLE IF NOT EXISTS live_status (uid INTEGER PRIMARY KEY, name TEXT NOT NULL, live_status INTEGER DEFAULT 0, title TEXT DEFAULT '', online INTEGER DEFAULT 0, cover TEXT DEFAULT '', room_id INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0)`,
]) {
  await execWithRetry(sql);
}

let totalPushed = 0;

// accounts: 始终全量（仅4条）
const accounts = localDb.query("SELECT * FROM accounts").all();
for (const r of accounts as any[]) {
  await execWithRetry({ sql: "INSERT OR IGNORE INTO accounts (uid, name, avatar, created_at) VALUES (?, ?, ?, ?)", args: [r.uid, r.name, r.avatar, r.created_at] });
}
console.log(`[sync-remote] accounts: ${accounts.length} rows`);

// dynamics: 增量（fetched_at > lastSync）
const dynamics = localDb.query("SELECT * FROM dynamics WHERE fetched_at > ?").all(lastSync);
for (const r of dynamics as any[]) {
  await execWithRetry({
    sql: "INSERT OR IGNORE INTO dynamics (id, uid, type, bili_type, text, rich_text, raw, images, author_name, author_face, author_url, dynamic_url, video_cover, video_title, forward, reserve, schedule_entries, live_time, live_title, created_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [r.id, r.uid, r.type, r.bili_type, r.text, r.rich_text, r.raw, r.images, r.author_name, r.author_face, r.author_url, r.dynamic_url, r.video_cover, r.video_title, r.forward, r.reserve, r.schedule_entries, r.live_time, r.live_title, r.created_at, r.fetched_at],
  });
}
totalPushed += dynamics.length;
console.log(`[sync-remote] dynamics: ${dynamics.length} new rows`);

// live_schedules: 增量（created_at > lastSync）
const schedules = localDb.query("SELECT * FROM live_schedules WHERE created_at > ?").all(lastSync);
for (const r of schedules as any[]) {
  await execWithRetry({
    sql: "INSERT OR IGNORE INTO live_schedules (id, dynamic_id, uid, rid, title, live_time, status, created_at, live_type, participants, live_room_url, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [r.id, r.dynamic_id, r.uid, r.rid, r.title, r.live_time, r.status, r.created_at, r.live_type, r.participants, r.live_room_url, r.source],
  });
}
totalPushed += schedules.length;
console.log(`[sync-remote] live_schedules: ${schedules.length} new rows`);

// live_status: 始终全量（仅3条）
const status = localDb.query("SELECT * FROM live_status").all();
for (const r of status as any[]) {
  await execWithRetry({
    sql: "INSERT OR REPLACE INTO live_status (uid, name, live_status, title, online, cover, room_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [r.uid, r.name, r.live_status, r.title, r.online, r.cover, r.room_id, r.updated_at],
  });
}
console.log(`[sync-remote] live_status: ${status.length} rows`);

// 记录本次同步时间
writeFileSync(SYNC_FILE, String(now));
console.log(`[sync-remote] 完成 (推送 ${totalPushed} 条新数据)`);