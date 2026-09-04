// 查询 B站直播状态，写入本地 SQLite
// 由 daemon 或 cron 定期调用
import { Database } from "bun:sqlite";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = (() => {
  // Bun: import.meta.dir gives the module's directory
  const dir = (import.meta as any).dir ?? fileURLToPath(import.meta.url).replace(/\/[^/]+$/, "");
  // from packages/crawler/src → repo root = 3 levels up
  return resolve(dir, "../../..");
})();
console.log("[live] REPO_ROOT:", REPO_ROOT);
const localDbPath = isAbsolute(process.env.LOCAL_DB_PATH ?? "")
  ? process.env.LOCAL_DB_PATH!
  : resolve(REPO_ROOT, process.env.LOCAL_DB_PATH ?? "data/local.db");
console.log("[live] localDbPath:", localDbPath);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const UIDS = [672353429, 672328094, 672342685];
const NAMES: Record<number, string> = {
  672353429: "贝拉kira", 672328094: "嘉然今天吃什么", 672342685: "乃琳Queen",
};
const ROOMS: Record<number, number> = {
  672353429: 22632424, 672328094: 22637261, 672342685: 22625027,
};

async function main() {
  try {
    const r = await fetch("https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids", {
      method: "POST",
      headers: { "User-Agent": UA, "Referer": "https://live.bilibili.com/", "Content-Type": "application/json" },
      body: JSON.stringify({ uids: UIDS }),
    });
    const data = await r.json() as any;
    if (data.code !== 0 || !data.data) throw new Error("B站 API failed");

    const db = new Database(localDbPath);
    db.run("CREATE TABLE IF NOT EXISTS live_status (uid INTEGER PRIMARY KEY, name TEXT NOT NULL, live_status INTEGER DEFAULT 0, title TEXT DEFAULT '', online INTEGER DEFAULT 0, cover TEXT DEFAULT '', room_id INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0)");

    const insert = db.prepare("INSERT OR REPLACE INTO live_status (uid, name, live_status, title, online, cover, room_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const uid of UIDS) {
      const info = data.data[uid];
      if (info) {
        insert.run(uid, NAMES[uid] ?? "", info.live_status, info.title ?? "", info.online ?? 0, info.cover_from_user ?? info.keyframe ?? "", ROOMS[uid] ?? 0, Date.now());
        console.log(`[live] ${NAMES[uid]}: live_status=${info.live_status} online=${info.online}`);
      }
    }
    console.log("[live] updated");
  } catch (e) {
    console.log("[live] error:", e);
  }
}
main();