import { fileURLToPath } from "node:url";
import { dirname, resolve, isAbsolute } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// monorepo 根：packages/db/src 的上三级
const MONOREPO_ROOT = resolve(__dirname, "../../..");

// 统一本地 SQLite 路径：默认 monorepo 根下的 data/local.db
// 设了 LOCAL_DB_PATH 绝对路径则直接用
export function getDbPath(): string {
  const p = process.env.LOCAL_DB_PATH ?? "data/local.db";
  return isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p)
    ? p
    : resolve(MONOREPO_ROOT, p);
}
