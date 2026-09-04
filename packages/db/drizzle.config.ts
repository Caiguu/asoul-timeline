import { defineConfig } from "drizzle-kit";

// generate 不连接 db，url 仅为占位；实际建表由 src/push.ts 用 getDbPath() 执行
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/local.db",
  },
});
