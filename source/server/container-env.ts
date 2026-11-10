import { resolve } from "node:path";
import { openSqlite } from "./sqlite.ts";

let database: ReturnType<typeof openSqlite> | undefined;
export const env = {
  get DB() {
    database ??= openSqlite(resolve(process.env.CPW_DATA_DIR || "/data", "club-price-watch.sqlite"), resolve(process.cwd(), "drizzle"));
    return database.binding;
  },
};
