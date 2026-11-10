import { APP, isIdentifier, isWatchlistUrl } from "../../core/config.ts";
import { parseResults } from "../../core/protocol.ts";
import type { CheckOutcome, CheckResult } from "../../core/checks.ts";

export interface ResultBrowserApi {
  tabs: { get: (id: number) => Promise<{ url?: string }>; sendMessage: (id: number, message: unknown, options: { frameId: number }) => Promise<unknown> };
}
export async function notifyWatchlist(results: (CheckOutcome | CheckResult)[], { url = location.href, browser = chrome, siteOrigin = APP.siteOrigin }: { url?: string; browser?: ResultBrowserApi; siteOrigin?: string } = {}): Promise<void> {
  const query = new URL(url).searchParams;
  const requestId = query.get("requestId");
  const rawTab = query.get("sourceTab");
  if (!isIdentifier(requestId) || !/^\d+$/.test(rawTab ?? "")) return;
  const tabId = Number(rawTab);
  if (!Number.isSafeInteger(tabId)) return;
  try {
    if (!isWatchlistUrl((await browser.tabs.get(tabId)).url, siteOrigin)) return;
    await browser.tabs.sendMessage(tabId, { type: "CPW_RUN_FINISHED", requestId, results: parseResults(results) }, { frameId: 0 });
  } catch { /* The originating tab may have been closed or navigated elsewhere. */ }
}
