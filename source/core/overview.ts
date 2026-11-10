import type { TrackedItem, HistoryPoint } from "./items.ts";
import { APP } from "./config.ts";

const DAY = 86400000;
export const savedTime = (value: string | null) => value ? Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(" ", "T") + "Z" : value) : NaN;
const positive = (value: number | null): value is number => value !== null && Number.isSafeInteger(value) && value > 0;
const month = (time: number) => new Date(time).toISOString().slice(0, 7);
export interface OverviewRow {
  id: string; name: string; current: number; previous: number; delta: number; percent: number; checkedAt: string; stale: boolean;
}

/** All calculations use full history. Unknown/other clubs and future observations never supply comparisons. */
export function buildOverview(all: TrackedItem[], now = Date.now(), clubId: string = APP.clubId, includeArchived = false) {
  const clubs = new Map<string, string>([[APP.clubId, APP.clubName]]);
  for (const item of all) {
    if (item.clubId) clubs.set(item.clubId, item.clubName || `Club ${item.clubId}`);
    for (const point of item.history) if (point.clubId) clubs.set(point.clubId, point.clubName || `Club ${point.clubId}`);
  }
  const selected = all.filter(item => item.clubId === clubId && (includeArchived || item.archivedAt === null));
  const pairs: OverviewRow[] = [];
  const opportunities: { id: string; name: string; current: number; checkedAt: string; stale: boolean; low: boolean; belowPurchase: number; target: boolean; records: number }[] = [];
  const monthly = new Map<string, Map<string, HistoryPoint>>();
  let records = 0, purchases = 0, otherClubRecords = 0, unknownRecords = 0, futureRecords = 0, invalidRecords = 0;
  let fresh = 0, stale = 0, undated = 0, missingPrice = 0, enoughHistory = 0;
  let first = Infinity, last = -Infinity;
  let currentTotal = 0, currentCount = 0;
  for (const item of selected) {
    const checked = savedTime(item.lastCheckedAt);
    const hasCurrent = positive(item.currentPriceCents) && Number.isFinite(checked) && checked <= now;
    if (!positive(item.currentPriceCents)) missingPrice++;
    if (!Number.isFinite(checked) || checked > now) undated++;
    else if (now - checked < 7 * DAY) fresh++;
    else stale++;
    const points = item.history.filter(p => {
      if (p.clubId === null) { unknownRecords++; return false; }
      if (p.clubId !== clubId) { otherClubRecords++; return false; }
      const time = savedTime(p.checkedAt);
      if (!Number.isFinite(time) || !positive(p.priceCents)) { invalidRecords++; return false; }
      if (time > now) { futureRecords++; return false; }
      return true;
    }).sort((a, b) => savedTime(a.checkedAt) - savedTime(b.checkedAt) || (a.id ?? 0) - (b.id ?? 0));
    if (new Set(points.map(p => savedTime(p.checkedAt))).size >= 2) enoughHistory++;
    for (const point of points) {
      records++; if (point.source === "purchase") purchases++;
      const time = savedTime(point.checkedAt); first = Math.min(first, time); last = Math.max(last, time);
      const key = month(time); let entries = monthly.get(key);
      if (!entries) { entries = new Map(); monthly.set(key, entries); }
      entries.set(item.id, point); // latest in this month, deterministic ties
    }
    if (!hasCurrent) continue;
    const current = item.currentPriceCents!;
    currentTotal += current; currentCount++;
    const previousPurchase = points.filter(p => p.source === "purchase" && savedTime(p.checkedAt) <= checked).at(-1);
    const isStale = now - checked >= 7 * DAY;
    if (previousPurchase) {
      const previous = previousPurchase.priceCents, delta = current - previous;
      pairs.push({ id: item.id, name: item.name, current, previous, delta, percent: delta / previous * 100, checkedAt: item.lastCheckedAt!, stale: isStale });
    }
    const earlier = points.filter(p => savedTime(p.checkedAt) < checked);
    const low = earlier.length > 0 && earlier.every(p => current <= p.priceCents);
    const belowPurchase = previousPurchase ? Math.max(0, previousPurchase.priceCents - current) : 0;
    const target = positive(item.targetPriceCents) && current <= item.targetPriceCents;
    if (low || belowPurchase > 0 || target) opportunities.push({ id: item.id, name: item.name, current, checkedAt: item.lastCheckedAt!, stale: isStale, low, belowPurchase, target, records: earlier.length });
  }
  const end = new Date(now); const start = Number.isFinite(first) ? new Date(first) : end;
  const firstMonth = Math.max(start.getUTCFullYear() * 12 + start.getUTCMonth(), end.getUTCFullYear() * 12 + end.getUTCMonth() - 23);
  const lastMonth = end.getUTCFullYear() * 12 + end.getUTCMonth();
  const trend: { month: string; observed: number; matched: number; previous: number | null; current: number | null; percent: number | null }[] = [];
  for (let index = firstMonth; index <= lastMonth; index++) {
    const key = month(Date.UTC(Math.floor(index / 12), index % 12, 1));
    const priorKey = month(Date.UTC(Math.floor((index - 1) / 12), (index - 1) % 12, 1));
    const current = monthly.get(key), prior = monthly.get(priorKey);
    let previousTotal = 0, nextTotal = 0, matched = 0;
    for (const [id, point] of current ?? []) {
      const previous = prior?.get(id); if (!previous) continue;
      previousTotal += previous.priceCents; nextTotal += point.priceCents; matched++;
    }
    trend.push({ month: key, observed: current?.size ?? 0, matched, previous: matched ? previousTotal : null, current: matched ? nextTotal : null, percent: matched ? (nextTotal - previousTotal) / previousTotal * 100 : null });
  }
  const previousBasket = pairs.reduce((sum, p) => sum + p.previous, 0), currentBasket = pairs.reduce((sum, p) => sum + p.current, 0);
  const up = pairs.filter(p => p.delta > 0).sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name));
  const down = pairs.filter(p => p.delta < 0).sort((a, b) => a.delta - b.delta || a.name.localeCompare(b.name));
  return {
    generatedAt: new Date(now).toISOString(), clubId, clubName: clubs.get(clubId) ?? `Club ${clubId}`, includeArchived,
    clubs: [...clubs].map(([id, name]) => ({ id, name })),
    basket: { matched: pairs.length, eligible: selected.length, previous: pairs.length ? previousBasket : null, current: pairs.length ? currentBasket : null, delta: pairs.length ? currentBasket - previousBasket : null, percent: pairs.length ? (currentBasket - previousBasket) / previousBasket * 100 : null, stale: pairs.filter(p => p.stale).length, currentTotal: currentCount ? currentTotal : null, currentCount },
    movement: { up: up.length, down: down.length, unchanged: pairs.length - up.length - down.length, increases: up.slice(0, 5), decreases: down.slice(0, 5) },
    opportunities: opportunities.sort((a, b) => Number(a.stale) - Number(b.stale) || b.belowPurchase - a.belowPurchase || a.name.localeCompare(b.name)),
    trend,
    coverage: { items: selected.length, records, purchases, otherPriceRecords: records - purchases, fresh, stale, undated, missingPrice, enoughHistory, unknownRecords, otherClubRecords, futureRecords, invalidRecords, first: Number.isFinite(first) ? new Date(first).toISOString() : null, last: Number.isFinite(last) ? new Date(last).toISOString() : null,
      databaseItems: all.length, archivedItems: all.filter(i => i.archivedAt !== null).length, databaseRecords: all.reduce((n, i) => n + i.history.length, 0), databaseUnknownRecords: all.reduce((n, i) => n + i.history.filter(p => p.clubId === null).length, 0) },
  };
}
export type OverviewData = ReturnType<typeof buildOverview>;
