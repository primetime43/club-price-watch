import { TEST_CLUB } from "./fixtures.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { APP } from "../core/config.ts";
import { productId, priceUrl, matchesPriceResponse, readClubPrice, positivePrice } from "../core/prices.ts";
import { priceToCents } from "../core/items.ts";
import { saleProduct, PRODUCT_ID, PRODUCT_URL } from "./fixtures.ts";

for (const [name, overrides, expected] of [
  ["offer price", {}, 367.99],
  ["standard fallback", { inClubOfferPrice: null }, 499.99],
  ["discount-only rejection", { inClubOfferPrice: null, clubItemStandardPrice: null }, null],
  ["hidden member price", { clubPriceVisible: "N" }, null],
  ["invalid offer", { offerStatusinvalid: "Y" }, null],
  ["wrong club", { clubId: "1", clubIdentifier: "1" }, null],
  ["clubIdentifier fallback", { clubId: null, clubIdentifier: "0555" }, 367.99],
] satisfies [string, Record<string, unknown>, number | null][]) {
  test(name, () => {
    const result = readClubPrice({ bjsClubProduct: [{ ...saleProduct, ...overrides }] }, "0555");
    assert.equal(result.ok ? result.price : null, expected);
  });
}
test("requested club is authoritative rather than the first entry", () => {
  const result = readClubPrice({ bjsClubProduct: [{ ...saleProduct, clubId: "1", inClubOfferPrice: { amount: 1 } }, saleProduct] }, "555");
  assert.deepEqual(result, { ok: true, price: 367.99, clubId: "555" });
});
test("malformed and nonpositive amounts never become prices", () => {
  for (const value of [null, undefined, false, true, [], [100], {}, "367.99oops", "0x10", "", 0, -1, NaN, Infinity]) assert.equal(positivePrice(value), null);
  assert.equal(positivePrice("367.99"), 367.99);
  assert.equal(readClubPrice(null, "555").ok, false);
});
test("price requests preserve the API store path and requested club", () => {
  const url = priceUrl(PRODUCT_ID, "0555");
  assert.equal(url.pathname, "/digital/live/api/v1.0/product/price/10201");
  assert.equal(url.searchParams.get("clubId"), TEST_CLUB.clubId);
  assert.equal(url.searchParams.get("productId"), PRODUCT_ID);
  assert.ok(matchesPriceResponse(url.href, PRODUCT_ID, "555"));
  assert.ok(!matchesPriceResponse(url.href.replace("clubId=555", "clubId=1"), PRODUCT_ID, "555"));
  assert.ok(!matchesPriceResponse(url.href.replace("api.bjs.com", "example.com"), PRODUCT_ID, "555"));
});
test("only BJ’s product URLs are accepted", () => {
  assert.equal(productId(PRODUCT_URL + "/"), PRODUCT_ID);
  assert.equal(productId(PRODUCT_URL.replace("www.bjs.com", "bjs.com")), PRODUCT_ID);
  for (const url of [PRODUCT_URL.replace("www.bjs.com", "example.com"), PRODUCT_URL.replace("https:", "http:"), PRODUCT_URL.replace("www.bjs.com", "www.bjs.com:444"), "https://www.bjs.com/"]) assert.equal(productId(url), null);
});
test("API dollars convert once to safe positive integer cents", () => {
  assert.equal(priceToCents(367.99), 36799);
  assert.equal(priceToCents(1999.99), 199999);
  for (const value of [0, -1, NaN, Infinity, Number.MAX_VALUE, "367.99"]) assert.equal(priceToCents(value), null);
});
