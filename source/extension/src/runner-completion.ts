import { isIdentifier } from "../../core/config.ts";
import { isRunnerUrl } from "../../core/protocol.ts";
import type { CheckResult } from "../../core/checks.ts";

interface Completion {
  url: string;
  automatic: boolean;
  dryRun: boolean;
  summarySaved: boolean;
  results: CheckResult[];
}
interface RunnerTabs {
  getCurrent(): Promise<{ id?: number; url?: string; pendingUrl?: string } | undefined>;
  remove(id: number): Promise<void>;
}
export async function closeCompletedQuickAdd(completion: Completion, tabs: RunnerTabs = chrome.tabs): Promise<boolean> {
  const { url, automatic, dryRun, summarySaved, results } = completion;
  if (!automatic || dryRun || !summarySaved || !isRunnerUrl(url)) return false;
  const query = new URL(url).searchParams;
  const id = query.get("itemId");
  if (query.get("autoClose") !== "1" || query.get("mode") !== "check" || !isIdentifier(id) ||
      results.length !== 1 || results[0].id !== id || results[0].status !== "recorded") return false;
  try {
    const current = await tabs.getCurrent();
    if (!Number.isInteger(current?.id) || current?.url !== url || (current.pendingUrl && current.pendingUrl !== url)) return false;
    await tabs.remove(current.id!);
    return true;
  } catch { return false; } // Keep the result visible if closing is unavailable.
}
