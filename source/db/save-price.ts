import { and, eq, isNull, sql } from "drizzle-orm";
import type { getDb } from "./index.ts";
import { trackedItems, priceChecks } from "./schema.ts";

export async function saveItemPrice(db: ReturnType<typeof getDb>, id: string, priceCents: number, requestedClub?: string) {
  const [existing] = await db.select().from(trackedItems).where(eq(trackedItems.id, id)).limit(1);
  if (!existing) return "missing";
  if (existing.archivedAt !== null) return "archived";
  if (!existing.clubId) return "missing-club";
  if (requestedClub !== undefined && existing.clubId !== requestedClub) return "other-club";
  const now = new Date().toISOString();
  const active = and(eq(trackedItems.id, id), isNull(trackedItems.archivedAt), eq(trackedItems.clubId, existing.clubId));
  // Both writes commit together. A check queued before archiving cannot append a price afterward.
  const [updated] = await db.batch([
    db.update(trackedItems).set({
      previousPriceCents: sql`${trackedItems.currentPriceCents}`, currentPriceCents: priceCents,
      lastCheckedAt: now,
    }).where(active).returning({ id: trackedItems.id }),
    db.insert(priceChecks).select(db.select({
      id: sql<number>`null`.as("id"),
      itemId: trackedItems.id,
      priceCents: sql<number>`${priceCents}`.as("price_cents"),
      source: sql<null>`null`.as("source"),
      purchaseLocation: sql<null>`null`.as("purchase_location"),
      clubId: trackedItems.clubId,
      clubName: trackedItems.clubName,
      checkedAt: sql<string>`${now}`.as("checked_at"),
    }).from(trackedItems).where(and(active, eq(trackedItems.lastCheckedAt, now)))),
  ]);
  return updated.length ? "saved" : "archived";
}
