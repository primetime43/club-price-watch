import assert from "node:assert/strict";
import test from "node:test";
import { readPriceInTab, resultPrice } from "../extension/src/browser-reader.ts";
import type { BrowserReaderApi, PriceListener } from "../extension/src/browser-reader.ts";
import { CheckError } from "../core/checks.ts";
import { installPageReader } from "../extension/src/page-reader.ts";
import { APP } from "../core/config.ts";
import { NONCE, PRODUCT_URL, PRODUCT_ID, item, priceMessage, saleProduct } from "./fixtures.ts";

function browserFixture(options: { result?: unknown; navigateAway?: boolean } = {}) {
  const listeners = new Set<PriceListener>();
  const removed: number[] = [];
  let url = "";
  const browser: BrowserReaderApi = {
    runtime: { onMessage: { addListener: listener => { listeners.add(listener); }, removeListener: listener => { listeners.delete(listener); } } },
    tabs: {
      create: async () => ({ id: 700 }),
      update: async (id, options_) => {
        url = options_.url;
        for (const listener of listeners) {
          listener({ ...priceMessage, price: 1 }, { tab: { id: 42 }, frameId: 0, url });
          listener(options.result ?? priceMessage, { tab: { id }, frameId: 0, url });
        }
      },
      get: async () => ({ url: options.navigateAway ? "https://example.com/" : url }),
      remove: async id => { removed.push(id); },
    },
  };
  return { browser, removed, listeners, url: () => url };
}
test("browser adapter reads and cleans up only its own successful tab", async () => {
  const f = browserFixture();
  assert.equal(await readPriceInTab(item(), { browser: f.browser, randomUUID: () => NONCE }), 367.99);
  assert.deepEqual(f.removed, [700]);
  assert.equal(f.url(), `${PRODUCT_URL}#cpw-check=${NONCE}&cpw-club=555`);
  assert.equal(f.listeners.size, 0);
});
test("failed tabs remain open and their listeners are removed", async () => {
  const f = browserFixture({ result: { ...priceMessage, status: 403 } });
  await assert.rejects(readPriceInTab(item(), { browser: f.browser, randomUUID: () => NONCE }), /Sign in/);
  assert.deepEqual(f.removed, []);
  assert.equal(f.listeners.size, 0);
});
test("user-navigated tabs are never closed", async () => {
  const f = browserFixture({ navigateAway: true });
  await readPriceInTab(item(), { browser: f.browser, randomUUID: () => NONCE });
  assert.deepEqual(f.removed, []);
});
test("unmatched responses time out without writing guessed prices", async () => {
  const f = browserFixture({ result: { ...priceMessage, nonce: "wrong" } });
  await assert.rejects(readPriceInTab(item(), { browser: f.browser, randomUUID: () => NONCE, timeoutMs: 5 }), /No price arrived/);
  assert.equal(f.listeners.size, 0);
  assert.deepEqual(f.removed, []);
});
test("result validation checks product, club, nonce, positivity and access status", () => {
  assert.equal(resultPrice(priceMessage, PRODUCT_ID, NONCE, "555"), 367.99);
  assert.equal(resultPrice({ ...priceMessage, clubId: "1" }, PRODUCT_ID, NONCE, "555"), null);
  assert.equal(resultPrice({ ...priceMessage, productId: "1234567890" }, PRODUCT_ID, NONCE, "555"), null);
  for (const price of [0, -1, NaN, Infinity, "367.99", true]) assert.throws(() => resultPrice({ ...priceMessage, price }, PRODUCT_ID, NONCE, "555"), CheckError);
  assert.throws(() => resultPrice({ ...priceMessage, error: "hidden" }, PRODUCT_ID, NONCE, "555"), /member price/);
  assert.throws(() => resultPrice({ ...priceMessage, status: 429 }, PRODUCT_ID, NONCE, "555"), /limiting/);
});
test("the page adapter forwards only the canonical parser result, not raw responses", async () => {
  const published: unknown[] = [];
  let fetcher: typeof fetch = async () => Response.json({ bjsClubProduct: [saleProduct], privateDiagnostic: "do-not-forward" });
  const dummyXhr = { open: () => {}, send: () => {} } as Pick<XMLHttpRequest, "open" | "send">;
  installPageReader({ href: `${PRODUCT_URL}#cpw-check=${NONCE}&cpw-club=555`, hash: `#cpw-check=${NONCE}&cpw-club=555`, xhrPrototype: dummyXhr,
    fetch: fetcher, replaceFetch: next => { fetcher = next; }, publish: message => published.push(message), delay: () => {} });
  await fetcher(`${APP.priceEndpoint}?productId=${PRODUCT_ID}&clubId=555`);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((published[0] as { price: number }).price, 367.99);
  assert.doesNotMatch(JSON.stringify(published), /do-not-forward|clubDisc|bjsClubProduct/);
});
test("normal browsing tabs are never instrumented", () => {
  installPageReader({ href: PRODUCT_URL, hash: "", fetch, xhrPrototype: { open: () => {}, send: () => {} } as Pick<XMLHttpRequest, "open" | "send">,
    replaceFetch: () => assert.fail("Modified normal browsing"), publish: () => assert.fail("Published from normal browsing"), delay: () => assert.fail("Scheduled fallback in normal browsing") });
});
