import assert from "node:assert/strict";
import test from "node:test";
import { CheckSession } from "../core/check-session.ts";
import { itemCheckState, checkItems } from "../core/checks.ts";
import type { CheckState } from "../core/checks.ts";
import { parseCheckStates, parseSiteReply } from "../core/protocol.ts";
import { createProgressReporter } from "../extension/src/check-progress.ts";
import { item } from "./fixtures.ts";

test("item status distinguishes unchecked, saved and stalled checks without changing last good price", () => {
  assert.equal(itemCheckState(item()).status, "waiting");
  const saved = item({ currentPriceCents: 999, lastCheckedAt: new Date().toISOString() });
  assert.equal(itemCheckState(saved).status, "saved");
  assert.equal(itemCheckState(saved, { status: "checking", message: "Reading", updatedAt: 1000 }, 182000).status, "failed");
  assert.equal(saved.currentPriceCents, 999);
  assert.equal(itemCheckState(saved, { status: "failed", message: "Sign in required", updatedAt: 1000 }).status, "failed");
});

test("progress bridge retains only validated item IDs, timestamps and public status fields", () => {
  const states = parseCheckStates({ one: { status: "checking", message: "Reading", updatedAt: 1000, secret: "discard" }, bad: { status: "unknown", message: "x", updatedAt: 1000 }, invalid: { status: "saved", message: "x", updatedAt: Infinity } });
  assert.deepEqual(states, { one: { status: "checking", message: "Reading", updatedAt: 1000 } });
  assert.equal(parseSiteReply({ type: "CPW_CHECK_STATES", requestId: "ping", states })?.type, "CPW_CHECK_STATES");
});

test("shared progress updates app jobs, ignores older snapshots and makes failed checks retryable", () => {
  let states: Record<string, CheckState> = {};
  const session = new CheckSession({ state: next => { states = next; }, refresh: () => {}, notice: () => {}, now: () => 1000 });
  try {
    const first = session.start("one")!;
    assert.equal(states.one.status, "waiting");
    session.receive({ type: "CPW_CHECKER_OPENED", requestId: first.requestId, ok: true });
    session.progress({ one: { status: "checking", message: "Reading", updatedAt: 1001 } });
    assert.equal(states.one.status, "checking");
    assert.equal(session.start("one"), null);
    session.progress({ one: { status: "failed", message: "Sign in required", updatedAt: 1002 } });
    session.progress({ one: { status: "waiting", message: "Old snapshot", updatedAt: 1001 } });
    assert.equal(states.one.status, "failed");
    const retry = session.start("one")!;
    assert.ok(retry);
    session.progress({ one: { status: "failed", message: "Earlier attempt", updatedAt: 1002 } });
    assert.equal(states.one.status, "waiting");
    session.receive({ type: "CPW_CHECK_FINISHED", requestId: retry.requestId, results: [{ id: "one", status: "recorded" }] });
    assert.equal(states.one.status, "saved");
  } finally { session.dispose(); }
});

test("reporters persist queue/check/result states and cannot overwrite a newer run", async () => {
  let data: Record<string, unknown> = {};
  const storage = { get: async () => structuredClone(data), set: async (value: Record<string, unknown>) => { data = { ...data, ...structuredClone(value) }; } } as unknown as typeof chrome.storage.local;
  const locks = { request: async (_name: string, run: () => Promise<void>) => run() } as unknown as LockManager;
  const first = createProgressReporter(storage, locks, "first");
  const second = createProgressReporter(storage, locks, "second");
  try {
    await first.waiting(["one", "two"]);
    assert.equal(parseCheckStates(data.checkStates).two.status, "waiting");
    await first.update("one", "checking", "Reading");
    await first.update("one", "saved", "Saved");
    await first.failOutstanding("Runner failed");
    assert.equal(parseCheckStates(data.checkStates).one.status, "saved");
    assert.equal(parseCheckStates(data.checkStates).two.status, "failed");
    await second.waiting(["one"]);
    await first.update("one", "failed", "Old run");
    assert.equal(parseCheckStates(data.checkStates).one.status, "waiting");
  } finally { first.dispose(); second.dispose(); }
});

test("check execution reports progress and status reporting failures cannot invalidate a save", async () => {
  const states: string[] = [];
  await checkItems({ items: [item()], dryRun: false, readPrice: async () => 9.99, savePrice: async () => {}, progress: async (_id, status) => { states.push(status); } });
  assert.deepEqual(states, ["checking", "saved"]);
  const results = await checkItems({ items: [item()], dryRun: false, readPrice: async () => 9.99, savePrice: async () => {}, progress: async () => { throw new Error("Storage unavailable"); } });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "recorded");
});

test("failed checks report failure without saving, and dry runs are labelled tested", async () => {
  const statuses: string[] = [];
  const common = { items: [item()], savePrice: async () => assert.fail("A failed check or dry run saved a price"), progress: async (_id: string, status: string) => { statuses.push(status); } };
  await checkItems({ ...common, dryRun: false, readPrice: async () => { throw new Error("Network failure"); } });
  assert.deepEqual(statuses, ["checking", "failed"]);
  statuses.length = 0;
  await checkItems({ ...common, dryRun: true, readPrice: async () => 9.99 });
  assert.deepEqual(statuses, ["checking", "tested"]);
});
