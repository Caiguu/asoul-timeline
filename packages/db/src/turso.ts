import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client/web";
import * as schema from "./schema";

export type TursoDB = ReturnType<typeof createTursoDb>;

export function createTursoDb(url: string, authToken: string) {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}