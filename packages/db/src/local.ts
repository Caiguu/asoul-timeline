import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema";
import { getDbPath } from "./paths";

export type DB = ReturnType<typeof createDb>;

export function createDb(dbPath: string = getDbPath()) {
  const sqlite = new Database(dbPath);
  sqlite.run("PRAGMA journal_mode = WAL;");
  sqlite.run("PRAGMA foreign_keys = ON;");
  return drizzle(sqlite, { schema });
}

export { schema };
