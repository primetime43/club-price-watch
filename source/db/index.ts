import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Local database binding DB is unavailable. Start the local development server with its D1 binding configured."
    );
  }

  return drizzle(env.DB, { schema });
}
