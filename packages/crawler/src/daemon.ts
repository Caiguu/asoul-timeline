// 常驻爬虫进程：每 30 分钟抓取一次并同步到云端
import { resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir, "..");
const REPO_ROOT = resolve(import.meta.dir, "../../..");
const ENV_FILE = resolve(REPO_ROOT, ".env");
const TICK_INTERVAL = 30 * 60 * 1000; // 30 分钟
const CRAWL_TIMEOUT = 3 * 60 * 1000; // 3 分钟超时

// 清理残留进程：chromium + crawl 子进程
async function killStaleProcesses() {
  try {
    Bun.spawn(["pkill", "-9", "-f", "chromium"], { stdio: ["ignore", "ignore", "ignore"] });
    await new Promise((r) => setTimeout(r, 500));
  } catch {}
}

async function runScript(name: string, timeout: number = CRAWL_TIMEOUT): Promise<{ code: number; out: string; err: string }> {
  const file = name === "live" ? "src/update-live-status.ts" : name === "sync" ? "src/sync-remote.ts" : "src/index.ts";
  const proc = Bun.spawn(
    ["bun", "--env-file=" + ENV_FILE, "run", file],
    { cwd: PKG_DIR, stdio: ["ignore", "pipe", "pipe"] },
  );
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try { proc.kill("SIGKILL"); } catch {}
    if (name === "crawl") killStaleProcesses(); // 超时后杀 chromium
  }, timeout);
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  await proc.exited;
  clearTimeout(timer);
  return { code: timedOut ? -1 : (proc.exitCode ?? -1), out, err };
}

async function tick() {
  const start = Date.now();
  console.log(`\n[${new Date().toLocaleString("zh-CN")}] tick start`);

  // 预清理：杀掉上次残留的 chromium 僵尸进程
  await killStaleProcesses();

  // 1. 直播状态（轻量 HTTP，很快）
  try {
    const r = await runScript("live", 20000); // 20s 超时
    if (r.out.trim()) console.log(r.out.split("\n").map((l: string) => "  " + l).join("\n"));
  } catch {}

  // 2. 爬取动态
  try {
    const r = await runScript("crawl");

    if (r.code === 0) {
      const captures = r.out.match(/\[bili\] \d+ got \d+ items, \d+ within last week/g);
      if (captures) console.log(captures.map((c) => "  " + c).join("\n"));

      // 3. 同步到远程
      console.log(`[${new Date().toLocaleString("zh-CN")}] crawl ok, syncing...`);
      const s = await runScript("sync", 60000); // 60s 超时（增量同步够用）
      if (s.code === 0) {
        console.log(`[${new Date().toLocaleString("zh-CN")}] sync ok`);
      } else {
        console.log(`[${new Date().toLocaleString("zh-CN")}] sync FAILED\n${s.err.slice(-300)}`);
      }
    } else if (r.code === -1) {
      console.log(`[${new Date().toLocaleString("zh-CN")}] crawl TIMEOUT (killed)`);
      // 超时后再清理一次
      await killStaleProcesses();
    } else {
      console.log(`[${new Date().toLocaleString("zh-CN")}] crawl FAILED (exit ${r.code})\n${r.err.slice(-300)}`);
    }
  } catch (e) {
    console.log(`[${new Date().toLocaleString("zh-CN")}] error:`, e);
  }

  const elapsed = Date.now() - start;
  const sleep = Math.max(TICK_INTERVAL - elapsed, 0);
  console.log(`[${new Date().toLocaleString("zh-CN")}] next tick in ${Math.round(sleep / 60000)}min`);
  setTimeout(tick, sleep);
}

console.log("[daemon] A-SOUL crawler daemon started");
tick();