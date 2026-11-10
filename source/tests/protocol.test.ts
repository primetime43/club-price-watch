import assert from "node:assert/strict";
import test from "node:test";
import { APP } from "../core/config.ts";
import { parseSiteRequest, parseSiteReply, parsePriceMessage, parseRunnerFinished, isCompatibleProtocol } from "../core/protocol.ts";
import { runnerOptions } from "../extension/src/background.ts";
import { notifyWatchlist } from "../extension/src/site-results.ts";
import { priceMessage } from "./fixtures.ts";

const sender = { id: APP.extensionId, tab: { id: 12 }, frameId: 0, url: APP.siteOrigin + "/" };
test("first-check messages can start only a selected item", () => {
  assert.equal(parseSiteRequest({ type: "CPW_OPEN_CHECKER", requestId: "request", run: true }), null);
  const options = runnerOptions({ type: "CPW_OPEN_RUNNER", requestId: "request", itemId: "one", run: true }, sender, APP.extensionId)!;
  const url = new URL(options.url);
  assert.equal(url.searchParams.get("mode"), "check");
  assert.equal(url.searchParams.get("itemId"), "one");
  assert.equal(url.searchParams.get("sourceTab"), "12");
  assert.equal(options.active, false);
});
test("the all-items website action opens idle rather than silently saving prices", () => {
  const options = runnerOptions({ type: "CPW_OPEN_RUNNER", requestId: "request", run: false }, sender, APP.extensionId)!;
  assert.equal(new URL(options.url).searchParams.has("mode"), false);
  assert.equal(options.active, true);
});
test("bridge rejects other sites, frames, extensions, malformed IDs and arbitrary URLs", () => {
  const message = { type: "CPW_OPEN_RUNNER", requestId: "request", itemId: "one", run: true };
  for (const patch of [{ url: "https://example.com/" }, { url: APP.siteOrigin + "/other" }, { frameId: 1 }, { id: "other-extension" }, { tab: {} }])
    assert.equal(runnerOptions(message, { ...sender, ...patch }, APP.extensionId), null);
  assert.equal(runnerOptions({ ...message, itemId: "https://example.com/" }, sender, APP.extensionId), null);
});
test("protocol compatibility is one contract rather than extension version arithmetic", () => {
  assert.ok(isCompatibleProtocol(APP.protocolVersion));
  assert.ok(!isCompatibleProtocol(APP.protocolVersion - 1));
  assert.equal(parseSiteReply({ type: "CPW_CHECKER_READY", requestId: "request", version: "1.0.2" }), null);
  assert.equal(parseSiteReply({ type: "CPW_CHECKER_READY", requestId: "request", version: APP.version, protocolVersion: APP.protocolVersion })?.type, "CPW_CHECKER_READY");
});
test("price and completion messages retain only validated public result fields", () => {
  const message = parsePriceMessage({ ...priceMessage, privateDiagnostic: "do-not-forward" });
  assert.ok(message);
  assert.doesNotMatch(JSON.stringify(message), /do-not-forward/);
  assert.equal(parsePriceMessage({ ...priceMessage, nonce: "wrong" }), null);
  assert.equal(parseRunnerFinished({ type: "CPW_RUN_FINISHED", requestId: "request", results: [{ id: "one", status: "recorded", price: 367.99, secret: "private" }] })?.results[0].status, "recorded");
  assert.equal(parseRunnerFinished({ type: "CPW_RUN_FINISHED", requestId: "request", results: [{ id: "one", status: "unknown" }] }), null);
});
test("completion returns only to the originating watchlist root tab", async () => {
  const messages: { id: number; message: unknown }[] = [];
  const url = `chrome-extension://${APP.extensionId}/runner.html?requestId=request&sourceTab=12`;
  await notifyWatchlist([{ id: "one", status: "recorded", price: 1999.99, name: "TV" }], { url, browser: { tabs: {
    get: async () => ({ url: APP.siteOrigin + "/" }),
    sendMessage: async (id, message) => { messages.push({ id, message }); },
  } } });
  assert.equal(messages[0].id, 12);
  assert.doesNotMatch(JSON.stringify(messages), /1999.99/);
  await notifyWatchlist([{ id: "one", status: "failed", error: "Sign in required" }], { url, browser: { tabs: {
    get: async () => ({ url: "https://example.com/" }), sendMessage: async () => assert.fail("Sent to unrelated tab"),
  } } });
});
