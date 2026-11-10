import { and, eq, isNull, sql } from "drizzle-orm";
import type { getDb } from "./index.ts";
import { trackedItems, priceChecks } from "./schema.ts";
import { APP } from "../core/config.ts";

export async function saveItemPrice(db: ReturnType<typeof getDb>, id: string, priceCents: number) {
  const [existing] = await db.select().from(trackedItems).where(eq(trackedItems.id, id)).limit(1);
  if (!existing) return "missing";
  if (existing.archivedAt !== null) return "archived";
  if (existing.clubId !== null && existing.clubId !== APP.clubId) return "other-club";
  const now = new Date().toISOString();
  const active = and(eq(trackedItems.id, id), isNull(trackedItems.archivedAt));
  // Both writes commit together. A check queued before archiving cannot append a price afterward.
  const [updated] = await db.batch([
    db.update(trackedItems).set({
      previousPriceCents: sql`${trackedItems.currentPriceCents}`, currentPriceCents: priceCents,
      lastCheckedAt: now, clubId: APP.clubId, clubName: APP.clubName,
    }).where(active).returning({ id: trackedItems.id }),
    db.insert(priceChecks).select(db.select({
      id: sql<number>`null`.as("id"),
      itemId: trackedItems.id,
      priceCents: sql<number>`${priceCents}`.as("price_cents"),
      source: sql<null>`null`.as("source"),
      purchaseLocation: sql<null>`null`.as("purchase_location"),
      clubId: sql<string>`${APP.clubId}`.as("club_id"),
      clubName: sql<string>`${APP.clubName}`.as("club_name"),
      checkedAt: sql<string>`${now}`.as("checked_at"),
    }).from(trackedItems).where(and(active, eq(trackedItems.lastCheckedAt, now)))),
  ]);
  return updated.length ? "saved" : "archived";
}
