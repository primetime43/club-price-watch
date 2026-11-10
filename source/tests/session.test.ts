import assert from "node:assert/strict";
import test from "node:test";
import { CheckSession } from "../core/check-session.ts";
import type { CheckState } from "../core/checks.ts";
import { item } from "./fixtures.ts";

function fixture(options: { openingTimeoutMs?: number; resultTimeoutMs?: number } = {}) {
  let states: Record<string, CheckState> = {};
  let opening = false;
  let refreshes = 0;
  let count = 0;
  const notices: string[] = [];
  const session = new CheckSession({ state: (next, nextOpening) => { states = next; opening = nextOpening; }, notice: message => notices.push(message),
    refresh: () => { refreshes++; }, now: () => 1000, requestId: () => `request-${++count}`, ...options });
  return { session, states: () => states, opening: () => opening, refreshes: () => refreshes, notices };
}
test("first checks target one item, suppress duplicates, and retain saved status", () => {
  const f = fixture();
  try {
    const request = f.session.start(item().id)!;
    assert.equal(request.run, true);
    assert.equal(request.itemId, item().id);
    assert.equal(f.session.start(item().id), null);
    f.session.receive({ type: "CPW_CHECKER_OPENED", requestId: request.requestId, ok: true });
    assert.equal(f.opening(), false);
    assert.equal(f.states()[item().id].status, "waiting");
    f.session.receive({ type: "CPW_CHECK_FINISHED", requestId: request.requestId, results: [{ id: item().id, status: "recorded" }] });
    assert.equal(f.states()[item().id].status, "saved");
    assert.equal(f.refreshes(), 1);
  } finally { f.session.dispose(); }
});
test("concurrent first checks keep separate request and item state", () => {
  const f = fixture();
  try {
    const first = f.session.start("first")!;
    const second = f.session.start("second")!;
    f.session.receive({ type: "CPW_CHECK_FINISHED", requestId: second.requestId, results: [{ id: "first", status: "recorded" }] });
    assert.equal(f.states().first.status, "waiting");
    f.session.receive({ type: "CPW_CHECK_FINISHED", requestId: first.requestId, results: [{ id: "first", status: "failed", error: "Sign in required" }] });
    assert.equal(f.states().first.status, "failed");
    assert.equal(f.states().second.status, "waiting");
  } finally { f.session.dispose(); }
});
test("opening and result timeouts become explicit failures", async () => {
  const opening = fixture({ openingTimeoutMs: 5 });
  opening.session.start(item().id);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(opening.states()[item().id].status, "failed");
  opening.session.dispose();
  const result = fixture({ resultTimeoutMs: 5 });
  const request = result.session.start(item().id)!;
  result.session.receive({ type: "CPW_CHECKER_OPENED", requestId: request.requestId, ok: true });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(result.states()[item().id].status, "failed");
  result.session.dispose();
});
test("a test result does not claim that a price was saved", () => {
  const f = fixture();
  try {
    const request = f.session.start(item().id)!;
    f.session.receive({ type: "CPW_CHECK_FINISHED", requestId: request.requestId, results: [{ id: item().id, status: "tested" }] });
    assert.equal(f.states()[item().id].status, "tested");
  } finally { f.session.dispose(); }
});
test("an observed API save resolves a lost callback, but old prices do not", () => {
  const f = fixture();
  try {
    f.session.start(item().id);
    f.session.observe([item({ currentPriceCents: 36799, lastCheckedAt: new Date(999).toISOString() })]);
    assert.equal(f.states()[item().id].status, "waiting");
    f.session.observe([item({ currentPriceCents: 36799, lastCheckedAt: new Date(1001).toISOString() })]);
    assert.equal(f.states()[item().id].status, "saved");
    assert.equal(f.opening(), false);
  } finally { f.session.dispose(); }
});
test("disconnected check requests show an actionable state", () => {
  const f = fixture();
  f.session.unavailable(item().id);
  assert.equal(f.states()[item().id].status, "failed");
  assert.match(f.notices[0], /extension update/);
  f.session.dispose();
});
