import { eq } from "drizzle-orm";
import type { getDb } from "./index.ts";
import { trackedItems, priceChecks } from "./schema.ts";
import { parsePurchase } from "../core/purchase.ts";
import { priceToCents } from "../core/items.ts";

/** Historical purchases never alter current observations, archive state or check timestamps. */
export async function savePurchase(db: ReturnType<typeof getDb>, id: string, value: unknown) {
  const purchase = parsePurchase(value);
  const [item] = await db.select({ id: trackedItems.id }).from(trackedItems).where(eq(trackedItems.id, id)).limit(1);
  if (!item) return false;
  await db.insert(priceChecks).values({ itemId: id, priceCents: priceToCents(purchase.price)!,
    checkedAt: purchase.date + "T00:00:00.000Z", source: "purchase", clubId: purchase.clubId ?? null, clubName: purchase.clubName ?? null }).onConflictDoNothing();
  return true;
}
