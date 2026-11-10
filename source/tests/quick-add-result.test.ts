import assert from "node:assert/strict";
import test from "node:test";
import { quickAddResult, watchQuickAddResult } from "../extension/src/quick-add-result.ts";

test("quick-add completion distinguishes saved, tested and failed results for its own item", () => {
  assert.equal(quickAddResult({ results: [{ id: "one", status: "recorded" }] }, "one"), "Added to your watchlist. Price saved.");
  assert.match(quickAddResult({ results: [{ id: "one", status: "tested" }] }, "one")!, /no price was saved/);
  assert.match(quickAddResult({ results: [{ id: "one", status: "failed", error: "Sign in required" }] }, "one")!, /Sign in required/);
  assert.equal(quickAddResult({ results: [{ id: "other", status: "recorded" }] }, "one"), null);
  assert.equal(quickAddResult({ results: [{ id: "one", status: "unknown" }] }, "one"), null);
});

test("popup sees completion already stored before it subscribes", async () => {
  const messages: string[] = [];
  let subscribed = false;
  const storage = {
    local: { get: async () => { assert.ok(subscribed); return { lastRun: { results: [{ id: "one", status: "recorded" }] } }; } },
    onChanged: { addListener: () => { subscribed = true; }, removeListener: () => { subscribed = false; } },
  } as unknown as Pick<typeof chrome.storage, "local" | "onChanged">;
  const stop = watchQuickAddResult("one", message => messages.push(message), storage);
  await Promise.resolve();
  assert.deepEqual(messages, ["Added to your watchlist. Price saved."]);
  stop();
  assert.equal(subscribed, false);
});

test("live popup result wins over an older storage read and unsubscribes cleanly", async () => {
  const messages: string[] = [];
  let listener: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void = () => {};
  let resolveRead!: (value: unknown) => void;
  let removed = false;
  const storage = {
    local: { get: () => new Promise(resolve => { resolveRead = resolve; }) },
    onChanged: { addListener: (next: typeof listener) => { listener = next; }, removeListener: () => { removed = true; } },
  } as unknown as Pick<typeof chrome.storage, "local" | "onChanged">;
  const stop = watchQuickAddResult("one", message => messages.push(message), storage);
  listener({ lastRun: { newValue: { results: [{ id: "one", status: "recorded" }] } } }, "sync");
  assert.equal(messages.length, 0);
  listener({ lastRun: { newValue: { results: [{ id: "one", status: "recorded" }] } } }, "local");
  resolveRead({ lastRun: { results: [{ id: "one", status: "failed", error: "Old result" }] } });
  await Promise.resolve();
  assert.deepEqual(messages, ["Added to your watchlist. Price saved."]);
  stop();
  assert.ok(removed);
  listener({ lastRun: { newValue: { results: [{ id: "one", status: "failed" }] } } }, "local");
  assert.equal(messages.length, 1);
});
