import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createDb } from "./local";
import { getDbPath } from "./paths";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const dbPath = getDbPath();

mkdirSync(dirname(dbPath), { recursive: true });

const db = createDb(dbPath);

migrate(db, { migrationsFolder: "./migrations" });

console.log(`[db] migrated -> ${dbPath}`);
