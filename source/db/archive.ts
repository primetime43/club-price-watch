import { and, desc, eq, isNull } from "drizzle-orm";
import type { getDb } from "./index.ts";
import { trackedItems } from "./schema.ts";

type Database = ReturnType<typeof getDb>;
export function listItems(db: Database, includeArchived = false) {
  return db.select().from(trackedItems).where(includeArchived ? undefined : isNull(trackedItems.archivedAt)).orderBy(desc(trackedItems.createdAt));
}
export async function setArchived(db: Database, id: string, archived: boolean) {
  // Repeated requests keep the original archive date. No observed fields are written.
  const updated = await db.update(trackedItems).set({ archivedAt: archived ? new Date().toISOString() : null })
    .where(and(eq(trackedItems.id, id), archived ? isNull(trackedItems.archivedAt) : undefined)).returning({ id: trackedItems.id });
  if (updated.length) return true;
  const [existing] = await db.select({ id: trackedItems.id }).from(trackedItems).where(eq(trackedItems.id, id)).limit(1);
  return Boolean(existing);
}
