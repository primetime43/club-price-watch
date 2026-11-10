import type { TrackedItem } from "./items.ts";
import { itemCheckState } from "./checks.ts";
import type { CheckState } from "./checks.ts";

export type WatchlistFilter = "all" | "drops" | "needs" | "failed" | "target" | "shopping" | "archived";
export type WatchlistSort = "added" | "drop" | "oldest" | "target";
export const CHECK_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export function priceChange(item: TrackedItem): number | null {
  return item.currentPriceCents === null || item.previousPriceCents === null ? null : item.currentPriceCents - item.previousPriceCents;
}
export function targetReached(item: TrackedItem): boolean {
  return item.currentPriceCents !== null && item.targetPriceCents !== null && item.currentPriceCents <= item.targetPriceCents;
}
function checkedTime(item: TrackedItem): number | null {
  if (!item.lastCheckedAt) return null;
  const value = item.lastCheckedAt;
  const time = Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(" ", "T") + "Z" : value);
  return Number.isFinite(time) ? time : null;
}
export function matchesFilter(item: TrackedItem, filter: WatchlistFilter, states: Record<string, CheckState>, now: number): boolean {
  if ((item.archivedAt !== null) !== (filter === "archived")) return false;
  switch (filter) {
    case "drops": return (priceChange(item) ?? 0) < 0;
    case "target": return targetReached(item);
    case "shopping": return item.onShoppingList;
    case "failed": return itemCheckState(item, states[item.id], now).status === "failed";
    case "needs": {
      const state = itemCheckState(item, states[item.id], now);
      if (states[item.id] && (state.status === "waiting" || state.status === "checking")) return false;
      const checked = checkedTime(item);
      return state.status === "failed" || item.currentPriceCents === null || checked === null || now - checked >= CHECK_AGE_MS;
    }
    default: return true;
  }
}
function compareNullable(a: number | null, b: number | null): number {
  return a === null ? b === null ? 0 : 1 : b === null ? -1 : a - b;
}
/** Stable sorting preserves the API's newest-added order for ties; never mutates the source. */
export function watchlistView(items: TrackedItem[], filter: WatchlistFilter, sort: WatchlistSort, search: string, states: Record<string, CheckState>, now = Date.now()): TrackedItem[] {
  const query = search.trim().toLowerCase();
  const selected = items.filter(item => matchesFilter(item, filter, states, now) && item.name.toLowerCase().includes(query));
  if (sort === "drop") selected.sort((a, b) => compareNullable(priceChange(a), priceChange(b)));
  else if (sort === "oldest") selected.sort((a, b) => (checkedTime(a) ?? -Infinity) - (checkedTime(b) ?? -Infinity) || 0);
  else if (sort === "target") {
    const distance = (item: TrackedItem) => item.currentPriceCents === null || item.targetPriceCents === null ? null : Math.abs(item.currentPriceCents - item.targetPriceCents);
    selected.sort((a, b) => compareNullable(distance(a), distance(b)));
  }
  return selected;
}
