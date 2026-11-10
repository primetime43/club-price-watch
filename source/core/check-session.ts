import { APP } from "./config.ts";
import type { CheckState } from "./checks.ts";
import type { TrackedItem } from "./items.ts";
import type { OpenRequest, SiteReply } from "./protocol.ts";

interface PendingCheck { itemId?: string; startedAt: number; openTimer?: ReturnType<typeof setTimeout>; resultTimer?: ReturnType<typeof setTimeout> }
export interface SessionEvents {
  state: (states: Record<string, CheckState>, opening: boolean) => void;
  notice: (message: string) => void;
  refresh: () => void;
  now?: () => number;
  requestId?: () => string;
  openingTimeoutMs?: number;
  resultTimeoutMs?: number;
}

/** Owns check lifecycle and timeouts independently of React, browser APIs, or storage. */
export class CheckSession {
  private jobs = new Map<string, PendingCheck>();
  private states: Record<string, CheckState> = {};
  private events: SessionEvents;
  constructor(events: SessionEvents) { this.events = events; }
  private timestamp(itemId: string): number { return Math.max(this.events.now?.() ?? Date.now(), (this.states[itemId]?.updatedAt ?? 0) + 1); }
  private emit(): void { this.events.state({ ...this.states }, [...this.jobs.values()].some(job => job.openTimer !== undefined)); }
  private release(id: string): PendingCheck | undefined {
    const job = this.jobs.get(id);
    if (!job) return;
    clearTimeout(job.openTimer);
    clearTimeout(job.resultTimer);
    this.jobs.delete(id);
    return job;
  }
  private fail(id: string, message: string): void {
    const job = this.release(id);
    if (job?.itemId) this.states[job.itemId] = { status: "failed", message, updatedAt: this.timestamp(job.itemId) };
    this.emit();
    this.events.notice(message);
  }
  unavailable(itemId?: string): void {
    const message = "Browser checker not connected. Apply the extension update, refresh this page, and retry.";
    if (itemId) this.states[itemId] = { status: "failed", message, updatedAt: this.timestamp(itemId) };
    this.emit();
    this.events.notice(message);
  }
  start(itemId?: string): OpenRequest | null {
    if (itemId && ["waiting", "checking"].includes(this.states[itemId]?.status)) {
      if ((this.events.now?.() ?? Date.now()) - this.states[itemId].updatedAt <= APP.jobTimeoutMs) return null;
      for (const [requestId, job] of this.jobs) if (job.itemId === itemId) this.release(requestId);
    }
    const id = this.events.requestId?.() ?? crypto.randomUUID();
    const startedAt = this.events.now?.() ?? Date.now();
    const openTimer = setTimeout(() => this.fail(id, "The checker did not respond. Apply the extension update and retry."), this.events.openingTimeoutMs ?? 4000);
    const job: PendingCheck = { itemId, startedAt, openTimer };
    if (itemId) {
      this.states[itemId] = { status: "waiting", startedAt, updatedAt: this.timestamp(itemId), message: "Waiting for the browser checker…" };
      job.resultTimer = setTimeout(() => this.fail(id, "The check did not finish. Keep the checker tab open, check BJ’s sign-in, and retry."), this.events.resultTimeoutMs ?? APP.jobTimeoutMs);
    }
    this.jobs.set(id, job);
    this.emit();
    return { type: "CPW_OPEN_CHECKER", requestId: id, itemId, run: Boolean(itemId) };
  }
  receive(message: SiteReply): void {
    const job = this.jobs.get(message.requestId);
    if (!job) return;
    if (message.type === "CPW_CHECKER_OPENED") {
      if (!message.ok) return this.fail(message.requestId, "The browser checker could not open. Apply the extension update and retry.");
      clearTimeout(job.openTimer);
      // An acknowledged job has no opening deadline, but may still await a result.
      job.openTimer = undefined;
      if (!job.itemId) this.release(message.requestId);
      this.emit();
      this.events.notice(job.itemId ? "Checking this item in your browser. Its price will appear here when saved." : "Checker opened. Choose Test prices or Check and save in that tab.");
    }
    if (message.type === "CPW_CHECK_FINISHED" && job.itemId) {
      const result = message.results.find(result => result.id === job.itemId);
      if (!result) return;
      this.release(message.requestId);
      if (result.status === "recorded") this.states[job.itemId] = { status: "saved", message: "Price checked and saved.", updatedAt: this.timestamp(job.itemId) };
      else this.states[job.itemId] = result.status === "tested"
        ? { status: "tested", message: "Test passed. Use Check price to save the result.", updatedAt: this.timestamp(job.itemId) }
        : { status: "failed", message: result.error ?? "No price was saved. Check BJ’s sign-in and retry.", updatedAt: this.timestamp(job.itemId) };
      this.emit();
      this.events.refresh();
      this.events.notice(result.status === "recorded" ? "Price checked and saved." : result.status === "tested" ? "Test passed; no saved prices were changed." : "The price check failed. See the message beside this item.");
    }
  }
  observe(items: Pick<TrackedItem, "id" | "currentPriceCents" | "lastCheckedAt">[]): void {
    // A saved API result also completes the job if a browser callback was lost.
    let changed = false;
    for (const [id, job] of this.jobs) {
      const item = items.find(item => item.id === job.itemId);
      if (item?.currentPriceCents != null && item.currentPriceCents > 0 && item.lastCheckedAt && Date.parse(item.lastCheckedAt) >= job.startedAt) {
        this.release(id);
        this.states[item.id] = { status: "saved", message: "Price checked and saved.", updatedAt: Date.parse(item.lastCheckedAt) };
        changed = true;
      }
    }
    if (changed) this.emit();
  }
  progress(states: Record<string, CheckState>): void {
    let changed = false;
    let refresh = false;
    for (const [id, state] of Object.entries(states)) {
      if (this.states[id] && this.states[id].updatedAt >= state.updatedAt) continue;
      this.states[id] = state;
      changed = true;
      const active = state.status === "waiting" || state.status === "checking";
      for (const [requestId, job] of this.jobs) {
        if (job.itemId !== id) continue;
        if (!active) this.release(requestId);
        else {
          clearTimeout(job.resultTimer);
          job.resultTimer = setTimeout(() => this.fail(requestId, "The checker stopped responding. Check its tab and retry."), this.events.resultTimeoutMs ?? APP.jobTimeoutMs);
        }
      }
      if (!active) refresh = true;
    }
    if (changed) this.emit();
    if (refresh) this.events.refresh();
  }
  dispose(): void { for (const id of this.jobs.keys()) this.release(id); }
}
