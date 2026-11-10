import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { sqliteBinding } from "../server/sqlite.ts";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema.ts";

// Exercise real SQL and foreign keys through the same Drizzle D1 adapter used by the app.
export function database(beforeDuplicateMigration?: (sqlite: DatabaseSync) => void) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON;");
  sqlite.exec(readFileSync(new URL("../drizzle/0000_initial_price_tracker.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0001_price_locations.sql", import.meta.url), "utf8"));
  beforeDuplicateMigration?.(sqlite);
  sqlite.exec(readFileSync(new URL("../drizzle/0002_duplicate_products.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0003_archive_items.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0004_shopping_list.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0005_purchase_history.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0006_purchase_location.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0007_purchase_club_identity.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0008_item_merges.sql", import.meta.url), "utf8"));
  let failAfter: number | null = null;
  const binding = sqliteBinding(sqlite, sql => {
    if (sql.startsWith("insert") && failAfter !== null && failAfter-- === 0) {
      failAfter = null; throw new Error("Injected insert failure");
    }
  });
  return { db: drizzle(binding, { schema }), close: () => sqlite.close(), failNextInsert: () => { failAfter = 0; }, failAfterInsert: (count: number) => { failAfter = count; } };
}
