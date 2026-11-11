import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";
import { getDbPath } from "./paths";

export type DB = ReturnType<typeof createDb>;

export function createDb(dbPath: string = getDbPath()) {
  const sqlite = new Database(dbPath);
  sqlite.run("PRAGMA journal_mode = WAL;");
  sqlite.run("PRAGMA foreign_keys = ON;");
  sqlite.run(`CREATE TABLE IF NOT EXISTS schedule_decisions (
    key TEXT PRIMARY KEY, result TEXT NOT NULL, created_at INTEGER NOT NULL
  )`);
  return drizzle(sqlite, { schema });
}

export { schema };
