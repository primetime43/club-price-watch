import { purchaseLocation } from "./purchase.ts";
import { record, isClubLocation } from "./items.ts";
import type { ClubLocation } from "./items.ts";
import { productId } from "./prices.ts";

export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;
export interface BackupItem extends ClubLocation {
  name: string; url: string; itemNumber: string | null; imageUrl: string | null;
  currentPriceCents: number | null; previousPriceCents: number | null; targetPriceCents: number | null;
  lastCheckedAt: string | null; createdAt: string; archivedAt: string | null; onShoppingList: boolean;
  aliases?: (ClubLocation & { url: string })[];
  history: (ClubLocation & { priceCents: number; checkedAt: string; source?: "purchase"; purchaseLocation?: string })[];
}
export interface WatchlistBackup { format: "club-price-watch"; version: 3 | 4; clubId: string; exportedAt: string; items: BackupItem[] }
export type RestoreMode = "missing" | "replace";
export class BackupError extends Error {}
const invalid = (message: string): never => { throw new BackupError(message); };
function text(value: unknown, max: number): string {
  return typeof value === "string" && value.trim() && value.length <= max ? value : invalid("The backup contains invalid item details.");
}
function date(value: unknown): string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : invalid("The backup contains an invalid date.");
}
function cents(value: unknown, nullable = true): number | null {
  if (nullable && value === null) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : invalid("Backup prices must be positive whole cents or null.");
}
export function parseBackup(value: unknown): WatchlistBackup {
  const data = record(value);
  if (data?.format !== "club-price-watch" || ![1, 2, 3, 4].includes(Number(data.version)) || typeof data.version !== "number" || typeof data.clubId !== "string" || !/^[1-9]\d{0,5}$/.test(data.clubId) || !Array.isArray(data.items))
    return invalid("Choose a version-1, version-2, version-3 or version-4 Club Price Watch backup.");
  function location(value: unknown): ClubLocation {
    if (data!.version === 1) return { clubId: null, clubName: null };
    if (!isClubLocation(value)) return invalid("The backup contains an invalid saved location.");
    return { clubId: value.clubId, clubName: value.clubName };
  }
  if (data.items.length > 1000) return invalid("A backup can contain at most 1,000 products.");
  let points = 0; let identities = data.items.length;
  const items: BackupItem[] = data.items.map(value => {
    const item = record(value);
    const id = productId(item?.url);
    if (!item || !id || typeof item.url !== "string" || !Array.isArray(item.history)) return invalid("The backup contains an invalid product or history.");
    points += item.history.length;
    if (points > 20_000) return invalid("A backup can contain at most 20,000 history points.");
    const url = new URL(item.url); url.hash = ""; url.search = "";
    const imageUrl = item.imageUrl === null ? null : text(item.imageUrl, 2048);
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) return invalid("Backup image links must use HTTPS.");
    if (item.onShoppingList !== undefined && typeof item.onShoppingList !== "boolean") return invalid("The backup contains an invalid shopping-list selection.");
    if (item.aliases !== undefined && (data.version !== 4 || !Array.isArray(item.aliases))) return invalid("Invalid merged product links.");
    const aliases = (item.aliases as unknown[] | undefined)?.map(value => {
      const alias = record(value);
      if (!alias || !productId(alias.url) || typeof alias.url !== "string") return invalid("Invalid merged product link.");
      const saved = location(alias);
      if (saved.clubId !== null && saved.clubId !== location(item).clubId) return invalid("Merged product club numbers must match.");
      const url = new URL(alias.url); url.search = ""; url.hash = "";
      return { ...saved, url: url.href };
    });
    identities += aliases?.length ?? 0;
    if (identities > 1000) return invalid("A backup can contain at most 1,000 products including merged links.");
    return { ...(aliases?.length ? { aliases } : {}), ...location(item), name: text(item.name, 1000), url: url.href,
      itemNumber: item.itemNumber === null ? null : text(item.itemNumber, 100), imageUrl,
      currentPriceCents: cents(item.currentPriceCents), previousPriceCents: cents(item.previousPriceCents), targetPriceCents: cents(item.targetPriceCents),
      lastCheckedAt: item.lastCheckedAt === null ? null : date(item.lastCheckedAt), createdAt: date(item.createdAt),
      archivedAt: Number(data.version) >= 3 ? item.archivedAt === null ? null : date(item.archivedAt) : null,
      onShoppingList: item.onShoppingList === true,
      history: item.history.map(value => {
        const point = record(value);
        if (!point) return invalid("The backup contains an invalid history entry.");
        if (point.source !== undefined && point.source !== null && point.source !== "purchase") return invalid("The backup contains an invalid history source.");
        const locationText = purchaseLocation(point.purchaseLocation);
        if (locationText && point.source !== "purchase") return invalid("Only purchase records can have a pickup location.");
        return { ...(locationText ? { purchaseLocation: locationText } : {}), ...(point.source === "purchase" ? { source: "purchase" as const } : {}), ...location(point), priceCents: cents(point.priceCents, false)!, checkedAt: date(point.checkedAt) };
      }).sort((a, b) => a.checkedAt.localeCompare(b.checkedAt)),
    };
  });
  return { format: "club-price-watch", version: 4, clubId: data.clubId, exportedAt: date(data.exportedAt), items };
}
export function parseBackupFile(contents: string): WatchlistBackup {
  if (new TextEncoder().encode(contents).byteLength > BACKUP_MAX_BYTES) return invalid("Backup files must be 20 MB or smaller.");
  let data: unknown;
  try { data = JSON.parse(contents); } catch { return invalid("This file is not valid JSON. Choose a Club Price Watch backup."); }
  return parseBackup(data);
}
