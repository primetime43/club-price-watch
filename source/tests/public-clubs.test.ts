import assert from "node:assert/strict";
import test from "node:test";
import { publicClubs, resolvePublicClub, resolvePublicClubResult } from "../core/public-clubs.ts";
import { APP } from "../core/config.ts";
import { orderPickupAddress } from "../extension/src/background.ts";

const address = "100 Example Road Example City, PA 15000";
const club = { storeName: "0111", uniqueID: "111", addressLine: ["100 Example Road"], city: "Example City", stateOrProvinceName: "PA", postalCode: "15000", Description: [{ displayStoreName: "Example Club" }] };
const neighbor = { ...club, storeName: "0222", uniqueID: "222", addressLine: ["200 Other Street"] };
function page(rows: unknown[], filler = "") {
  const state = JSON.stringify({ filler, "https://api.bjs.com/digital/live/api/v1.2/club/search/10201": { Stores: { PhysicalStore: rows } } }).replaceAll("&", "&a;").replaceAll('"', "&q;");
  return `<html><script id="bjs-universal-app-state" type="application/json">${state}</script></html>`;
}

test("public locator data yields only validated club identity, address and detail URL", () => {
  assert.deepEqual(publicClubs(page([club])), [{ clubId: "111", clubName: "Example Club, PA", address: "100 Example Road Example City PA 15000", detailUrl: "https://www.bjs.com/cl/example-city/0111" }]);
  for (const row of [{ ...club, uniqueID: "222" }, { ...club, storeName: "0" }, { ...club, city: "../../account" }, { ...club, postalCode: "invalid" }, { ...club, Description: [] }]) assert.deepEqual(publicClubs(page([row])), []);
  assert.deepEqual(publicClubs("<html>No locator data</html>"), []);
});

test("public locator parsing handles its larger page state while ignoring unrelated fields", () => {
  assert.equal(publicClubs(page([club], "x".repeat(850_000))).length, 1);
});

test("public pickup lookup requests accept only a bounded address from this extension's top-frame order picker", () => {
  const sender = { id: APP.extensionId, frameId: 0, url: "https://www.bjs.com/account/manageOrders/example-order" };
  const message = { type: "CPW_RESOLVE_PICKUP_CLUB", address };
  assert.equal(orderPickupAddress(message, sender, APP.extensionId), address);
  for (const patch of [{ id: "other" }, { frameId: 1 }, { url: "https://www.bjs.com/account/payments" }, { url: "https://example.com/" }])
    assert.equal(orderPickupAddress(message, { ...sender, ...patch }, APP.extensionId), null);
  for (const bad of ["", "x".repeat(301), "Location\nAccount details", 12])
    assert.equal(orderPickupAddress({ ...message, address: bad }, sender, APP.extensionId), null);
});

test("public lookup matches the full pickup address then confirms the club-number URL and detail-page address", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    calls.push(String(url));
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.body, undefined);
    assert.equal(options?.headers, undefined);
    return new Response(page(calls.length === 1 ? [neighbor, club] : [club]));
  };
  assert.deepEqual(await resolvePublicClub(address.replace("Road", "Rd."), fetcher), { clubId: "111", clubName: "Example Club, PA" });
  assert.deepEqual(calls, [APP.clubLocatorUrl, "https://www.bjs.com/cl/example-city/0111"]);
});

test("unmatched/ambiguous addresses and blocked public pages stay unknown without guessing or retrying", async () => {
  for (const rows of [[neighbor], [club, { ...club, storeName: "0222", uniqueID: "222" }]]) {
    let calls = 0;
    assert.equal(await resolvePublicClub(address, async () => { calls++; return new Response(page(rows)); }), null);
    assert.equal(calls, 1);
  }
  let calls = 0;
  assert.equal(await resolvePublicClub(address, async () => { calls++; return new Response("Forbidden", { status: 403 }); }), null);
  assert.equal(calls, 1);
  calls = 0;
  assert.equal(await resolvePublicClub(address, async () => { calls++; return new Response(page(calls === 1 ? [club] : [neighbor])); }), null);
  assert.equal(calls, 2);
});

test("public lookup distinguishes HTTP verification failures from unmatched addresses", async () => {
  const blocked = await resolvePublicClubResult(address, async () => new Response("", { status: 403 }));
  assert.equal(blocked.club, null); assert.match(blocked.message, /HTTP 403/);
  const mismatch = await resolvePublicClubResult(address, async () => new Response(page([neighbor])));
  assert.match(mismatch.message, /address did not match/);
});
