import { asc } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { getDb } from "./index.ts";
import { trackedItems, priceChecks, itemAliases } from "./schema.ts";
import { APP } from "../core/config.ts";
import { parseBackup, BackupError } from "../core/backup.ts";
import type { WatchlistBackup, RestoreMode } from "../core/backup.ts";
import { productId } from "../core/prices.ts";
import { isDuplicateProductError } from "./add-item.ts";

type Database = ReturnType<typeof getDb>;
export async function exportBackup(db: Database): Promise<WatchlistBackup> {
  // Read both tables in one snapshot. Dashboard history is intentionally capped; backups aren't.
  const [items, checks, aliases] = await db.batch([db.select().from(trackedItems).orderBy(asc(trackedItems.createdAt)), db.select().from(priceChecks).orderBy(asc(priceChecks.checkedAt), asc(priceChecks.id)), db.select().from(itemAliases)]);
  const history = new Map<string, typeof checks>();
  for (const point of checks) { const rows = history.get(point.itemId) ?? []; rows.push(point); history.set(point.itemId, rows); }
  return parseBackup({ format: "club-price-watch", version: 4, clubId: APP.clubId, exportedAt: new Date().toISOString(),
    items: items.map(item => {
      const links = aliases.filter(alias => alias.itemId === item.id && productId(alias.url) !== productId(item.url)).map(({ url, clubId, clubName }) => ({ url, clubId, clubName }));
      return { ...item, ...(links.length ? { aliases: links } : {}), history: history.get(item.id) ?? [] };
    }) });
}
export async function restoreBackup(db: Database, backup: WatchlistBackup, mode: RestoreMode) {
  // Validate before planning any database writes, including when called outside the route.
  const checked = parseBackup(backup);
  if (mode !== "missing" && mode !== "replace") throw new Error("Choose a restore mode.");
  const existingItems = mode === "missing" ? await db.select({ url: trackedItems.url, clubId: trackedItems.clubId }).from(trackedItems) : [];
  const existingAliases = mode === "missing" ? await db.select({ url: itemAliases.url, clubId: itemAliases.clubId }).from(itemAliases) : [];
  const existing = [...existingItems, ...existingAliases];
  const links = (item: WatchlistBackup["items"][number]) => [item, ...(item.aliases ?? [])];
  const overlaps = (a: { url: string; clubId: string | null }, b: { url: string; clubId: string | null }) => productId(a.url) === productId(b.url) && (a.clubId === null || b.clubId === null || a.clubId === b.clubId);
  const selected = checked.items.filter(item => !links(item).some(link => existing.some(saved => overlaps(saved, link))));
  for (let i = 0; i < selected.length; i++) {
    if (links(selected[i]).some((link, j, all) => all.slice(0, j).some(other => overlaps(other, link))) || selected.slice(0, i).some(other => links(other).some(a => links(selected[i]).some(b => overlaps(a, b)))))
      throw new BackupError("This backup contains duplicate products for the same or an unknown location. Resolve those duplicates before restoring.");
  }
  const statements: BatchItem<"sqlite">[] = [];
  if (mode === "replace") statements.push(db.delete(itemAliases), db.delete(priceChecks), db.delete(trackedItems));
  const items = selected.map(({ history, aliases, ...item }) => ({ item: { ...item, id: crypto.randomUUID() }, history, aliases }));
  // Stay below D1's bound-parameter limit for every statement.
  for (let i = 0; i < items.length; i += 5) statements.push(db.insert(trackedItems).values(items.slice(i, i + 5).map(row => row.item)));
  const aliasRows = items.flatMap(row => (row.aliases ?? []).map(alias => ({ ...alias, id: crypto.randomUUID(), itemId: row.item.id, productId: productId(alias.url)! })));
  for (let i = 0; i < aliasRows.length; i += 12) statements.push(db.insert(itemAliases).values(aliasRows.slice(i, i + 12)));
  const checks = items.flatMap(row => row.history.map(point => ({ ...point, itemId: row.item.id })));
  for (let i = 0; i < checks.length; i += 12) statements.push(db.insert(priceChecks).values(checks.slice(i, i + 12)));
  try { if (statements.length) await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]); }
  catch (error) {
    if (isDuplicateProductError(error)) throw new BackupError("A matching product was added while restoring. No partial import was saved; retry Add missing products.");
    throw error;
  }
  return { imported: items.length, skipped: checked.items.length - items.length, historyPoints: checks.length };
}
