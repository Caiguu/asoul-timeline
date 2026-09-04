import { createApp } from "./routes";
import { createDb } from "@asoul-timeline/db/local";

const db = createDb();
const app = createApp(db);
const port = Number(process.env.API_PORT ?? 8787);

export default { port, fetch: app.fetch };