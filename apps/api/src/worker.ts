import { createTursoDb } from "@asoul-timeline/db";
import { createApp } from "./routes";

export default {
  async fetch(request: Request, env: any) {
    const db = createTursoDb(env.TURSO_DB_URL, env.TURSO_AUTH_TOKEN);
    const app = createApp(db);
    return app.fetch(request);
  },
};