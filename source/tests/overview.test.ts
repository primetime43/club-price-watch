import assert from "node:assert/strict";
import test from "node:test";
import { buildOverview } from "../core/overview.ts";
import type { TrackedItem, HistoryPoint } from "../core/items.ts";
import { database } from "./database.ts";
import { readOverview } from "../db/overview.ts";
import { addItem } from "../db/add-item.ts";
import { priceChecks } from "../db/schema.ts";
import { PRODUCT_URL } from "./fixtures.ts";

const now = Date.parse("2026-11-10T12:00:00Z");
const point = (priceCents: number, checkedAt: string, source?: "purchase", clubId: string | null = "111"): HistoryPoint => ({ priceCents, checkedAt, source, clubId, clubName: clubId ? "Example" : null });
const item = (id: string, history: HistoryPoint[] = [], extra: Partial<TrackedItem> = {}): TrackedItem => ({ id, name: id, url: PRODUCT_URL, itemNumber: null, imageUrl: null, clubId: "111", clubName: "Example", currentPriceCents: 500, previousPriceCents: null, targetPriceCents: null, archivedAt: null, onShoppingList: false, lastCheckedAt: "2026-11-10T10:00:00Z", history, ...extra });

test("overview compares last purchase only at the same club and before the saved price; future and unknown data cannot supply baselines", () => {
  const result = buildOverview([item("one", [point(600, "2026-09-01", "purchase"), point(550, "2026-10-01", "purchase"), point(100, "2026-11-11", "purchase"), point(10, "2026-10-02", "purchase", null), point(20, "2026-10-03", "purchase", "222")])], now, "111");
  assert.equal(result.basket.previous, 550); assert.equal(result.basket.current, 500); assert.equal(result.basket.delta, -50);
  assert.equal(result.movement.down, 1); assert.equal(result.coverage.futureRecords, 1); assert.equal(result.coverage.unknownRecords, 1); assert.equal(result.coverage.otherClubRecords, 1);
  assert.equal(result.opportunities[0].low, true);
});

test("monthly trend matches products across immediately adjacent months, without letting newly added prices move the comparison", () => {
  const data = [item("a", [point(100, "2026-09-01"), point(110, "2026-10-01")]), item("new expensive", [point(100000, "2026-10-02")]), item("gap", [point(300, "2026-08-01"), point(900, "2026-10-01")])];
  const result = buildOverview(data, now, "111");
  const october = result.trend.find(p => p.month === "2026-10")!;
  assert.equal(october.observed, 3); assert.equal(october.matched, 1); assert.equal(october.previous, 100); assert.equal(october.current, 110); assert.equal(october.percent, 10);
  assert.equal(result.trend.find(p => p.month === "2026-09")?.matched, 0);
  assert.equal(result.trend.find(p => p.month === "2026-11")?.percent, null);
});

test("opportunities require earlier history for lows, flag stale prices, and retain target and last-paid reasons", () => {
  const result = buildOverview([item("single", [point(500, "2026-11-10T10:00:00Z")]), item("stale", [point(600, "2026-08-01", "purchase")], { lastCheckedAt: "2026-10-01", targetPriceCents: 550 }), item("missing", [], { currentPriceCents: null }), item("undated", [], { lastCheckedAt: null })], now, "111");
  assert.equal(result.opportunities.length, 1); const opportunity = result.opportunities[0];
  assert.equal(opportunity.id, "stale"); assert.equal(opportunity.stale, true); assert.equal(opportunity.target, true); assert.equal(opportunity.belowPurchase, 100);
  assert.equal(result.coverage.stale, 1); assert.equal(result.coverage.undated, 1); assert.equal(result.coverage.missingPrice, 1);
});

test("archive and club scopes do not mix baskets; empty data stays empty rather than showing zero savings", () => {
  const data = [item("a", [point(600, "2026-01-01", "purchase")]), item("archived", [point(700, "2026-01-01", "purchase")], { archivedAt: "2026-11-01" }), item("other", [], { clubId: "222" })];
  assert.equal(buildOverview(data, now, "111").basket.matched, 1);
  assert.equal(buildOverview(data, now, "111", true).basket.matched, 2);
  const empty = buildOverview([], now, "111"); assert.equal(empty.basket.current, null); assert.equal(empty.basket.percent, null); assert.equal(empty.coverage.first, null); assert.equal(empty.opportunities.length, 0);
});

test("basket includes unchanged items and offsets rises/drops using one package of each matched product", () => {
  const result = buildOverview([item("up", [point(400, "2026-10-01", "purchase")]), item("down", [point(600, "2026-10-01", "purchase")]), item("same", [point(500, "2026-10-01", "purchase")]), item("no baseline", [], { currentPriceCents: 90000 })], now, "111");
  assert.equal(result.basket.matched, 3); assert.equal(result.basket.eligible, 4);
  assert.equal(result.basket.previous, 1500); assert.equal(result.basket.current, 1500); assert.equal(result.basket.percent, 0);
  assert.equal(result.movement.up, 1); assert.equal(result.movement.down, 1); assert.equal(result.movement.unchanged, 1);
  assert.equal(result.basket.currentTotal, 91500);
});

test("database overview uses all history in one snapshot, including purchase baselines older than 60 points and legacy UTC dates", async () => {
  const a = database();
  try {
    const saved = (await addItem(a.db, { name: "Full history", url: PRODUCT_URL, currentPrice: 5 }, { clubId: "111", clubName: "Example" })).item;
    await a.db.insert(priceChecks).values({ itemId: saved.id, clubId: "111", clubName: "Example", priceCents: 700, source: "purchase", checkedAt: "2025-01-01 12:00:00" });
    for (let i = 0; i < 65; i++) await a.db.insert(priceChecks).values({ itemId: saved.id, clubId: "111", clubName: "Example", priceCents: 600, checkedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString() });
    const result = await readOverview(a.db, "111", false, Date.now() + 1000);
    assert.equal(result.basket.previous, 700); assert.equal(result.coverage.records, 67); assert.equal(result.basket.matched, 1);
    assert.equal((await a.db.select().from(priceChecks)).length, 67);
  } finally { a.close(); }
});
