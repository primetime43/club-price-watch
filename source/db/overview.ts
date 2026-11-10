import type { getDb } from "./index.ts";
import { trackedItems, priceChecks } from "./schema.ts";
import { buildOverview } from "../core/overview.ts";

export async function readOverview(db: ReturnType<typeof getDb>, clubId: string, includeArchived: boolean, now = Date.now()) {
  const [items, checks] = await db.batch([db.select().from(trackedItems), db.select().from(priceChecks)]);
  const history = new Map<string, typeof checks>();
  for (const point of checks) { const list = history.get(point.itemId) ?? []; list.push(point); history.set(point.itemId, list); }
  return buildOverview(items.map(item => ({ ...item, history: history.get(item.id) ?? [] })), now, clubId, includeArchived);
}
