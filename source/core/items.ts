export interface ClubLocation { clubId: string | null; clubName: string | null }
export function isClubLocation(value: unknown): value is ClubLocation {
  const row = record(value);
  return Boolean(row && ((row.clubId === null && row.clubName === null) ||
    (typeof row.clubId === "string" && /^[1-9]\d{0,5}$/.test(row.clubId) && typeof row.clubName === "string" && row.clubName.trim() && row.clubName.length <= 100)));
}
export interface HistoryPoint extends ClubLocation { id?: number; source?: "purchase" | null; purchaseLocation?: string | null; priceCents: number; checkedAt: string }
export function isHistoryPoint(value: unknown): value is HistoryPoint {
  const row = record(value);
  return Boolean(row && (row.purchaseLocation === undefined || row.purchaseLocation === null || (row.source === "purchase" && typeof row.purchaseLocation === "string" && row.purchaseLocation.length <= 300 && Boolean(row.purchaseLocation.trim()))) && (row.source === undefined || row.source === null || row.source === "purchase") && isClubLocation(row) && typeof row.checkedAt === "string" &&
    Number.isFinite(Date.parse(row.checkedAt)) && typeof row.priceCents === "number" &&
    Number.isSafeInteger(row.priceCents) && row.priceCents > 0);
}
export interface TrackedItem {
  id: string;
  name: string;
  url: string;
  itemNumber: string | null;
  imageUrl: string | null;
  clubId: string | null;
  clubName: string | null;
  currentPriceCents: number | null;
  previousPriceCents: number | null;
  targetPriceCents: number | null;
  lastCheckedAt: string | null;
  archivedAt: string | null;
  onShoppingList: boolean;
  history: HistoryPoint[];
}
export interface ItemInput {
  name: string;
  url: string;
  itemNumber?: string;
  imageUrl?: string;
  currentPrice?: number | null;
  targetPrice?: number | null;
  clubId?: string | null;
  clubName?: string | null;
}
export interface ProductPreview {
  name: string | null;
  imageUrl: string | null;
  itemNumber: string | null;
  price: number | null;
}
export type CheckItem = Pick<TrackedItem, "id" | "name" | "url" | "clubId" | "clubName">;
export interface ItemEdit { name: string; targetPrice: number | null }

export function shoppingListValue(value: unknown): boolean {
  const input = record(value);
  if (!input || typeof input.onShoppingList !== "boolean") throw new Error("Choose whether this item belongs on your shopping list.");
  if (Object.keys(input).some(key => key !== "id" && key !== "onShoppingList")) throw new Error("Change the shopping list separately from other item changes.");
  return input.onShoppingList;
}

export function archiveValue(value: unknown): boolean {
  const input = record(value);
  if (!input || typeof input.archived !== "boolean") throw new Error("Choose whether to archive or restore this item.");
  if (Object.keys(input).some(key => key !== "id" && key !== "archived")) throw new Error("Archive or restore separately from other item changes.");
  return input.archived;
}

/** Editing details must never write observed prices or append price history. */
export function itemEditValues(value: unknown): { name: string; targetPriceCents: number | null } {
  const input = record(value);
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 300) throw new Error("Enter an item name between 1 and 300 characters.");
  const targetPriceCents = priceToCents(input?.targetPrice);
  if (input?.targetPrice !== null && targetPriceCents === null) throw new Error("Enter a positive target price, or leave it blank to remove the target.");
  return { name, targetPriceCents };
}

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Prices cross the API boundary in dollars; persistence uses integer cents. */
export function priceToCents(value: unknown, allowZero = false): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) return null;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && (allowZero || cents > 0) ? cents : null;
}

export function isTrackedItem(value: unknown): value is TrackedItem {
  const item = record(value);
  const nullableText = (value: unknown) => value === null || typeof value === "string";
  const nullableCents = (value: unknown) => value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
  return Boolean(item && isClubLocation(item) && typeof item.id === "string" && typeof item.name === "string" && typeof item.url === "string" &&
    nullableText(item.itemNumber) && nullableText(item.imageUrl) && nullableText(item.lastCheckedAt) && typeof item.onShoppingList === "boolean" &&
    (item.archivedAt === null || (typeof item.archivedAt === "string" && Number.isFinite(Date.parse(item.archivedAt)))) &&
    nullableCents(item.currentPriceCents) && nullableCents(item.previousPriceCents) && nullableCents(item.targetPriceCents) &&
    Array.isArray(item.history) && item.history.every(point => {
      const row = record(point);
      return row && isClubLocation(row) && typeof row.checkedAt === "string" && typeof row.priceCents === "number" && Number.isSafeInteger(row.priceCents) && row.priceCents >= 0;
    }));
}

export function isProductPreview(value: unknown): value is ProductPreview {
  const preview = record(value);
  const nullableText = (value: unknown) => value === null || typeof value === "string";
  return Boolean(preview && nullableText(preview.name) && nullableText(preview.imageUrl) && nullableText(preview.itemNumber) &&
    (preview.price === null || priceToCents(preview.price) !== null));
}
