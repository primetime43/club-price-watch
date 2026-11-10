import { asc, eq, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema.ts";

/** Full saved history for one item; the watchlist's 60-point limit does not apply. */
export async function readItemHistory(db: DrizzleD1Database<typeof schema>, id: string) {
  const [item] = await db.select({ id: schema.trackedItems.id }).from(schema.trackedItems).where(eq(schema.trackedItems.id, id)).limit(1);
  if (!item) return null;
  return db.select({
    id: schema.priceChecks.id,
    source: schema.priceChecks.source,
    purchaseLocation: schema.priceChecks.purchaseLocation,
    priceCents: schema.priceChecks.priceCents,
    checkedAt: schema.priceChecks.checkedAt,
    clubId: schema.priceChecks.clubId,
    clubName: schema.priceChecks.clubName,
  }).from(schema.priceChecks).where(eq(schema.priceChecks.itemId, id))
    .orderBy(asc(sql`julianday(${schema.priceChecks.checkedAt})`), asc(schema.priceChecks.id));
}
