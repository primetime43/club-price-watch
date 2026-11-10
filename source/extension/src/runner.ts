import { APP, isIdentifier } from "../../core/config.ts";
import { createItemsClient } from "../../core/api.ts";
import { CheckError, checkItems, failureMessage, selectCheckItems } from "../../core/checks.ts";
import { readPriceInTab } from "./browser-reader.ts";
import { notifyWatchlist } from "./site-results.ts";
import { button, element } from "./dom.ts";
import { closeCompletedQuickAdd } from "./runner-completion.ts";
import type { CheckResult } from "../../core/checks.ts";
import { createProgressReporter } from "./check-progress.ts";
import { getServerOrigin } from "./connection.ts";

const status = element("status");
const log = element("log");
const test = button("test");
const save = button("check");
const history = element("history");
const query = new URL(location.href).searchParams;
void getServerOrigin().then(origin => {
  (element("watchlist-link") as HTMLAnchorElement).href = origin;
}).catch(() => {});
let running = false;
const report = (message: string) => { log.textContent += message + "\n"; };

async function run(dryRun: boolean, automatic = false): Promise<void> {
  if (running) return;
  running = true;
  test.disabled = save.disabled = true;
  log.textContent = "";
  const startedUrl = location.href;
  let completedResults: CheckResult[] = [];
  let summarySaved = false;
  const progress = createProgressReporter();
  let siteOrigin: string = APP.siteOrigin;
  try {
    siteOrigin = await getServerOrigin();
    const api = createItemsClient(siteOrigin);
    const singleItem = query.has("itemId");
    const selectedId = query.get("itemId");
    if (isIdentifier(selectedId)) await progress.waiting([selectedId]);
    const items = selectCheckItems(await api.list(), query.get("itemId"));
    if (singleItem) status.textContent = "Waiting for any earlier price check to finish…";
    await navigator.locks.request("club-price-watch-check", singleItem ? {} : { ifAvailable: true }, async lock => {
      if (!lock) throw new CheckError("A price check is already running in another checker tab.");
      status.textContent = dryRun ? "Testing prices. Saved prices will stay unchanged." : "Checking prices and saving successful results.";
      if (!singleItem) await progress.waiting(items.map(item => item.id));
      const results = await checkItems({ items, dryRun, progress: progress.update,
        readPrice: item => readPriceInTab(item), savePrice: api.savePrice, report });
      completedResults = results;
      await notifyWatchlist(results, { siteOrigin });
      const failures = results.filter(result => result.status === "failed").length;
      status.textContent = !results.length ? "No valid BJ’s product links are tracked." : failures
        ? `Finished with ${failures} skipped item(s) out of ${results.length}. Check the BJ’s tabs that were left open.`
        : `${dryRun ? "Test passed" : "Prices saved"}. Checked ${results.length} item(s).`;
      try {
        const lastRun = { checkedAt: new Date().toISOString(), dryRun, results };
        await chrome.storage.local.set({ lastRun });
        summarySaved = true;
        history.textContent = `Last ${dryRun ? "test" : "check"}: ${new Date(lastRun.checkedAt).toLocaleString()}.`;
      } catch { report("The local result summary could not be saved. The results above are still valid."); }
    });
  } catch (error) {
    status.textContent = failureMessage(error);
    await progress.failOutstanding(status.textContent);
    const id = query.get("itemId");
    if (isIdentifier(id)) {
      const results = [{ id, status: "failed" as const, error: status.textContent }];
      await notifyWatchlist(results, { siteOrigin });
      try { await chrome.storage.local.set({ lastRun: { checkedAt: new Date().toISOString(), dryRun, results } }); }
      catch { /* The runner still displays the failure if local storage is unavailable. */ }
    }
  } finally { progress.dispose(); running = false; test.disabled = save.disabled = false; }
  // Release the run lock and publish/persist results before closing our own tab.
  if (location.href === startedUrl) await closeCompletedQuickAdd({ url: startedUrl, automatic, dryRun, summarySaved, results: completedResults });
}
test.addEventListener("click", () => void run(true));
save.addEventListener("click", () => void run(false));
window.addEventListener("beforeunload", event => { if (running) event.preventDefault(); });
const mode = query.get("mode");
if (mode === "test" || mode === "check") void run(mode === "test", true);
else chrome.storage.local.get("lastRun").then(({ lastRun }: { lastRun?: { checkedAt?: string; dryRun?: boolean } }) => {
  if (lastRun?.checkedAt) history.textContent = `Last ${lastRun.dryRun ? "test" : "check"}: ${new Date(lastRun.checkedAt).toLocaleString()}.`;
}).catch(() => {});
