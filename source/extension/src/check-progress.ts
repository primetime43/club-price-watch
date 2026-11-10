import { record } from "../../core/items.ts";
import { parseCheckStates } from "../../core/protocol.ts";
import type { CheckState } from "../../core/checks.ts";

export function createProgressReporter(storage = chrome.storage.local, lock = navigator.locks, runId: string = crypto.randomUUID()) {
  const owned = new Set<string>();
  async function write(id: string | null, status?: CheckState["status"], message?: string): Promise<void> {
    try {
      await lock.request("cpw-check-progress", async () => {
        const raw = record((await storage.get("checkStates")).checkStates) ?? {};
        const states = parseCheckStates(raw);
        for (const itemId of id === null ? owned : [id]) {
          const previous = record(raw[itemId]);
          if (status !== "waiting" && previous?.runId !== runId) continue;
          if (id === null && !["waiting", "checking"].includes(states[itemId]?.status)) continue;
          const next = { status: status ?? states[itemId].status, message: message ?? states[itemId].message,
            updatedAt: Math.max(Date.now(), (states[itemId]?.updatedAt ?? 0) + 1), runId };
          Object.defineProperty(raw, itemId, { value: next, writable: true, configurable: true, enumerable: true });
        }
        const newest = Object.entries(raw).sort((a, b) => Number(record(b[1])?.updatedAt ?? 0) - Number(record(a[1])?.updatedAt ?? 0)).slice(0, 200);
        await storage.set({ checkStates: Object.fromEntries(newest) });
      });
    } catch { /* Status reporting cannot turn a successful price save into a failure. */ }
  }
  const heartbeat = setInterval(() => { void write(null); }, 30_000);
  return {
    async waiting(ids: string[]) { for (const id of ids) { owned.add(id); await write(id, "waiting", "Waiting for earlier checks to finish…"); } },
    update: (id: string, status: CheckState["status"], message: string) => write(id, status, message),
    failOutstanding: (message: string) => write(null, "failed", message),
    dispose: () => clearInterval(heartbeat),
  };
}
