import assert from "node:assert/strict";
import test from "node:test";
import { item } from "./fixtures.ts";
import { APP } from "../core/config.ts";
import { CHECK_AGE_MS, matchesFilter, watchlistView } from "../core/watchlist-view.ts";
import type { WatchlistFilter } from "../core/watchlist-view.ts";
import type { CheckState } from "../core/checks.ts";

const now = Date.parse("2026-11-08T16:00:00Z");
const recent = new Date(now - 60_000).toISOString();
const saved = (id: string, overrides: Parameters<typeof item>[0] = {}) => item({ id, name: id, currentPriceCents: 1000, lastCheckedAt: recent, ...overrides });

test("biggest drop uses dollar changes, preserves ties, puts missing comparisons last and leaves source order intact", () => {
  const rows = [saved("unknown"), saved("up", { previousPriceCents: 900 }), saved("flat", { previousPriceCents: 1000 }), saved("small", { previousPriceCents: 1100 }), saved("big", { previousPriceCents: 1500 }), saved("tie", { previousPriceCents: 1500 })];
  const original = rows.map(item => item.id);
  assert.deepEqual(watchlistView(rows, "all", "drop", "", {}, now).map(item => item.id), ["big", "tie", "small", "flat", "up", "unknown"]);
  assert.deepEqual(rows.map(item => item.id), original);
  assert.deepEqual(watchlistView(rows, "all", "added", "", {}, now).map(item => item.id), original);
});

test("oldest check puts never-checked first and interprets legacy SQLite timestamps as UTC", () => {
  const rows = [saved("recent"), saved("legacy", { lastCheckedAt: "2026-11-08 15:00:00" }), saved("never", { lastCheckedAt: null }), saved("old", { lastCheckedAt: "2026-11-08T10:00:00Z" }), saved("never2", { lastCheckedAt: null })];
  assert.deepEqual(watchlistView(rows, "all", "oldest", "", {}, now).map(item => item.id), ["never", "never2", "old", "legacy", "recent"]);
});

test("distance from target uses the absolute dollar gap, including reached targets, with unknowns last", () => {
  const rows = [saved("no-target"), saved("no-price", { currentPriceCents: null, targetPriceCents: 900 }), saved("above", { targetPriceCents: 900 }), saved("far-below", { targetPriceCents: 2000 }), saved("at", { targetPriceCents: 1000 }), saved("below", { targetPriceCents: 1050 })];
  assert.deepEqual(watchlistView(rows, "all", "target", "", {}, now).map(item => item.id), ["at", "below", "above", "far-below", "no-target", "no-price"]);
  assert.deepEqual(watchlistView(rows, "target", "target", "", {}, now).map(item => item.id), ["at", "below", "far-below"]);
});

test("needs-checking handles the seven-day boundary, failures, stalled leases, dry runs and active work", () => {
  const rows = [saved("fresh"), saved("old", { lastCheckedAt: new Date(now - CHECK_AGE_MS).toISOString() }), saved("almost", { lastCheckedAt: new Date(now - CHECK_AGE_MS + 1).toISOString() }), item({ id: "never" }), saved("failed"), saved("pending", { lastCheckedAt: null }), saved("stalled"), item({ id: "tested" })];
  const states: Record<string, CheckState> = {
    failed: { status: "failed", message: "Failed", updatedAt: now },
    pending: { status: "waiting", message: "Queued", updatedAt: now },
    stalled: { status: "checking", message: "Reading", updatedAt: now - APP.jobTimeoutMs - 1 },
    tested: { status: "tested", message: "Not saved", updatedAt: now },
  };
  assert.deepEqual(watchlistView(rows, "needs", "added", "", states, now).map(item => item.id), ["old", "never", "failed", "stalled", "tested"]);
  assert.deepEqual(watchlistView(rows, "failed", "added", "", states, now).map(item => item.id), ["failed", "stalled"]);
  assert.equal(rows.find(item => item.id === "failed")!.currentPriceCents, 1000);
});

test("search, shopping-list selection and archive visibility compose across every filter", () => {
  const archived = saved("Milk archived", { archivedAt: recent, onShoppingList: true, targetPriceCents: 1100, previousPriceCents: 1200 });
  const milk = saved("Milk", { onShoppingList: true });
  const rows = [archived, milk, saved("Tea", { onShoppingList: true }), saved("Bread")];
  assert.deepEqual(watchlistView(rows, "shopping", "added", " MILK ", {}, now).map(item => item.id), ["Milk"]);
  assert.deepEqual(watchlistView(rows, "archived", "added", "milk", {}, now).map(item => item.id), ["Milk archived"]);
  for (const filter of ["all", "drops", "needs", "failed", "target", "shopping"] satisfies WatchlistFilter[]) {
    assert.equal(matchesFilter(archived, filter, {}, now), false);
  }
});
