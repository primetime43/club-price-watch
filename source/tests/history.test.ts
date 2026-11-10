import assert from "node:assert/strict";
import test from "node:test";
import { database } from "./database.ts";
import { trackedItems, priceChecks } from "../db/schema.ts";
import { readItemHistory } from "../db/history.ts";
import { createItemsClient } from "../core/api.ts";
import { PRODUCT_URL } from "./fixtures.ts";

test("detail history includes records beyond 60, keeps each location and never mixes items", async () => {
  const a = database();
  try {
    await a.db.insert(trackedItems).values([
      { id: "one", name: "One", url: PRODUCT_URL, clubId: "111", clubName: "Test club" },
      { id: "two", name: "Two", url: PRODUCT_URL.replace("6351759", "6351760") },
    ]);
    for (let i = 0; i < 65; i++) await a.db.insert(priceChecks).values({
      itemId: "one", priceCents: 1001 + i, checkedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      clubId: i === 0 ? null : "222", clubName: i === 0 ? null : "Recorded club",
    });
    await a.db.insert(priceChecks).values({ itemId: "two", priceCents: 9999 });
    const history = await readItemHistory(a.db, "one");
    assert.equal(history?.length, 65);
    assert.equal(history?.[0].priceCents, 1001);
    assert.equal(history?.[0].clubId, null);
    assert.equal(history?.[0].clubName, null);
    assert.equal(history?.[64].clubId, "222");
    assert.equal(history?.[64].priceCents, 1065);
    assert.equal((await readItemHistory(a.db, "two"))?.length, 1);
    assert.equal(await readItemHistory(a.db, "missing"), null);
    assert.equal((await a.db.select().from(priceChecks)).length, 66);
  } finally { a.close(); }
});

test("history client validates records, preserves cents and unknown locations, and reports failures", async () => {
  const point = { priceCents: 36799, checkedAt: "2026-11-08T15:00:00Z", clubId: null, clubName: null };
  const api = createItemsClient("", async url => {
    assert.equal(url, "/api/items/history?id=one");
    return Response.json({ history: [point] });
  });
  assert.deepEqual(await api.history("one"), [point]);
  await assert.rejects(api.history("../invalid"), /valid item/);
  for (const invalid of [{ ...point, priceCents: 0 }, { ...point, checkedAt: "invalid" }, { ...point, clubId: "111" }]) {
    const bad = createItemsClient("", async () => Response.json({ history: [invalid] }));
    await assert.rejects(bad.history("one"), /invalid price history/);
  }
  const missing = createItemsClient("", async () => Response.json({ error: "Item not found." }, { status: 404 }));
  await assert.rejects(missing.history("one"), /Item not found/);
  assert.deepEqual(await createItemsClient("", async () => Response.json({ history: [] })).history("one"), []);
});

test("history orders legacy UTC and ISO dates by time with deterministic ties and supports empty items", async () => {
  const a = database();
  try {
    await a.db.insert(trackedItems).values({ id: "one", name: "One", url: PRODUCT_URL });
    assert.deepEqual(await readItemHistory(a.db, "one"), []);
    for (const [checkedAt, priceCents] of [["2026-11-08 18:00:00", 1800], ["2026-11-08T10:00:00Z", 1000], ["2026-11-08T10:00:00.000Z", 1001]] as const) {
      await a.db.insert(priceChecks).values({ itemId: "one", checkedAt, priceCents });
    }
    assert.deepEqual((await readItemHistory(a.db, "one"))?.map(point => point.priceCents), [1000, 1001, 1800]);
  } finally { a.close(); }
});
