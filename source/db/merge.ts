import { and, eq, sql } from "drizzle-orm";
import type { getDb } from "./index.ts";
import { trackedItems, priceChecks, itemAliases } from "./schema.ts";

export async function mergeItems(db: ReturnType<typeof getDb>, sourceId: string, keepId: string) {
  if (sourceId === keepId) throw new Error("Choose two different items.");
  const [source] = await db.select().from(trackedItems).where(eq(trackedItems.id, sourceId));
  const [keep] = await db.select().from(trackedItems).where(eq(trackedItems.id, keepId));
  if (!source || !keep) throw new Error("One of these items no longer exists. Refresh and try again.");
  if (source.clubId !== keep.clubId) throw new Error("Merge items only when their tracking club numbers match (or both are unknown).");
  const token = crypto.randomUUID();
  // Detect concurrent edits/checks before any mutation. The entire batch is one transaction.
  const snapshot = (item: typeof source) => and(...([
    "id", "name", "url", "clubId", "clubName", "currentPriceCents", "previousPriceCents", "lastCheckedAt", "targetPriceCents", "archivedAt", "onShoppingList", "imageUrl", "itemNumber",
  ] as const).map(key => sql`${trackedItems[key]} IS ${typeof item[key] === "boolean" ? Number(item[key]) : item[key]}`));
  const guard = sql`EXISTS (SELECT 1 FROM item_aliases WHERE id = ${token} AND item_id = ${keepId})`;
  const [inserted] = await db.batch([
    db.insert(itemAliases).select(db.select({ id: sql<string>`${token}`.as("id"), itemId: sql<string>`${keepId}`.as("item_id"),
      productId: sql<string>`${trackedItems.productId}`.as("product_id"), url: trackedItems.url, clubId: trackedItems.clubId, clubName: trackedItems.clubName,
      replacesId: sql<string>`${sourceId}`.as("replaces_id"),
    }).from(trackedItems).where(and(snapshot(source), sql`EXISTS ${db.select({ id: trackedItems.id }).from(trackedItems).where(snapshot(keep))}`))).returning({ id: itemAliases.id }),
    db.update(trackedItems).set({ onShoppingList: keep.onShoppingList || source.onShoppingList }).where(and(eq(trackedItems.id, keepId), guard)),
    db.update(itemAliases).set({ itemId: keepId }).where(and(eq(itemAliases.itemId, sourceId), guard)),
    // Only identical purchase records can collide; keep one copy of those, all other observations.
    db.delete(priceChecks).where(and(eq(priceChecks.itemId, sourceId), guard, sql`price_checks.source = 'purchase' AND EXISTS (
      SELECT 1 FROM price_checks AS kept WHERE kept.item_id = ${keepId} AND kept.source = 'purchase'
      AND kept.checked_at = price_checks.checked_at AND kept.price_cents = price_checks.price_cents
      AND coalesce(kept.club_id, '') = coalesce(price_checks.club_id, '')
      AND lower(trim(coalesce(kept.purchase_location, ''))) = lower(trim(coalesce(price_checks.purchase_location, '')))
    )`)),
    db.update(priceChecks).set({ itemId: keepId }).where(and(eq(priceChecks.itemId, sourceId), guard)),
    db.delete(priceChecks).where(and(eq(priceChecks.itemId, sourceId), guard)),
    db.delete(trackedItems).where(and(eq(trackedItems.id, sourceId), guard)),
  ]);
  if (!inserted.length) throw new Error("An item changed during the merge. Refresh and try again.");
  return { id: keepId };
}
