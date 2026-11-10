import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { getDb } from "./index.ts";
import { trackedItems, priceChecks, itemAliases } from "./schema.ts";
import { APP } from "../core/config.ts";
import { productId } from "../core/prices.ts";
import { priceToCents } from "../core/items.ts";
import type { ClubLocation, ItemInput } from "../core/items.ts";

export function isDuplicateProductError(error: unknown): boolean {
  for (let depth = 0; error instanceof Error && depth < 8; depth++, error = error.cause)
    if (error.message.includes("cpw_duplicate_product")) return true;
  return false;
}

export async function addItem(db: ReturnType<typeof getDb>, input: ItemInput, location: ClubLocation = APP) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("Add an item name.");
  const product = productId(input.url);
  if (!product) throw new Error("Use a valid bjs.com product link.");
  const findExisting = async () => {
    const club = location.clubId === null ? undefined : or(eq(trackedItems.clubId, location.clubId), isNull(trackedItems.clubId));
    const aliasClub = location.clubId === null ? undefined : or(eq(itemAliases.clubId, location.clubId), isNull(itemAliases.clubId));
    const [alias] = await db.select().from(itemAliases).where(and(eq(itemAliases.productId, product), aliasClub)).limit(1);
    const [item] = await db.select().from(trackedItems).where(alias ? eq(trackedItems.id, alias.itemId) : and(eq(trackedItems.productId, product), club)).limit(1);
    if (!item) return null;
    const history = await db.select().from(priceChecks).where(eq(priceChecks.itemId, item.id)).orderBy(desc(priceChecks.checkedAt), desc(priceChecks.id)).limit(60);
    return { item: { ...item, history: history.reverse() }, existing: true };
  };
  const existing = await findExisting();
  if (existing) return existing;
  const url = new URL(input.url); url.search = ""; url.hash = "";
  const now = new Date().toISOString();
  const item = { id: crypto.randomUUID(), name, url: url.href,
    itemNumber: input.itemNumber?.trim() || null, imageUrl: input.imageUrl?.trim() || null,
    clubId: location.clubId, clubName: location.clubName,
    currentPriceCents: priceToCents(input.currentPrice), previousPriceCents: null,
    targetPriceCents: priceToCents(input.targetPrice), lastCheckedAt: priceToCents(input.currentPrice) === null ? null : now, archivedAt: null, onShoppingList: false };
  const history = item.currentPriceCents === null ? [] : [{ itemId: item.id, priceCents: item.currentPriceCents, checkedAt: now, clubId: item.clubId, clubName: item.clubName }];
  try {
    // The database trigger serializes competing inserts. Roll back the item if its initial history fails.
    if (history.length) await db.batch([db.insert(trackedItems).values(item), db.insert(priceChecks).values(history)]);
    else await db.insert(trackedItems).values(item);
  } catch (error) {
    if (isDuplicateProductError(error)) {
      const winner = await findExisting();
      if (winner) return winner;
    }
    throw error;
  }
  return { item: { ...item, history }, existing: false };
}
