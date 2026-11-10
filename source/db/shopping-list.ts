import { eq } from "drizzle-orm";
import type { getDb } from "./index.ts";
import { trackedItems } from "./schema.ts";

export async function setShoppingList(db: ReturnType<typeof getDb>, id: string, onShoppingList: boolean) {
  const updated = await db.update(trackedItems).set({ onShoppingList }).where(eq(trackedItems.id, id)).returning({ id: trackedItems.id });
  return updated.length > 0;
}
