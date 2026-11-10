import assert from "node:assert/strict";
import test from "node:test";
import { APP } from "../core/config.ts";
import { closeCompletedQuickAdd } from "../extension/src/runner-completion.ts";

const url = `chrome-extension://${APP.extensionId}/runner.html?itemId=one&mode=check&autoClose=1`;
const completion = { url, automatic: true, dryRun: false, summarySaved: true,
  results: [{ id: "one", status: "recorded" as const }] };

test("a quick-add runner closes only itself after the saved result summary is persisted", async () => {
  const removed: number[] = [];
  assert.equal(await closeCompletedQuickAdd(completion, {
    getCurrent: async () => ({ id: 21, url }),
    remove: async id => { removed.push(id); },
  }), true);
  assert.deepEqual(removed, [21]);
});

test("manual runners, retries, tests, failures and unpublished results stay open", async () => {
  const mustStayOpen = { getCurrent: async () => { assert.fail("Should not attempt to close this run"); }, remove: async () => assert.fail("Closed a non-successful automatic check") };
  for (const patch of [
    { url: url.replace("&autoClose=1", "") }, { automatic: false }, { dryRun: true },
    { summarySaved: false }, { results: [] },
    { results: [{ id: "one", status: "failed" as const }] },
    { results: [{ id: "one", status: "tested" as const }] },
    { results: [{ id: "other", status: "recorded" as const }] },
    { results: [...completion.results, { id: "two", status: "recorded" as const }] },
  ]) assert.equal(await closeCompletedQuickAdd({ ...completion, ...patch }, mustStayOpen), false);
});

test("runner closing preserves navigated tabs and tolerates already closed tabs", async () => {
  for (const current of [undefined, { id: 21, url: "https://www.bjs.com/" }, { id: 21, url, pendingUrl: "https://www.bjs.com/" }]) {
    assert.equal(await closeCompletedQuickAdd(completion, { getCurrent: async () => current,
      remove: async () => assert.fail("Closed a navigated tab") }), false);
  }
  assert.equal(await closeCompletedQuickAdd(completion, { getCurrent: async () => ({ id: 21, url }),
    remove: async () => { throw new Error("Tab already closed"); } }), false);
});
