import { APP } from "../../core/config.ts";
import { CheckError } from "../../core/checks.ts";
import type { CheckItem } from "../../core/items.ts";
import { normalizeClub, productId } from "../../core/prices.ts";
import { parsePriceMessage } from "../../core/protocol.ts";
import type { MessageSource } from "../../core/protocol.ts";

export type PriceListener = (message: unknown, sender: MessageSource) => void;
export interface BrowserReaderApi {
  tabs: {
    create: (options: { url: string; active: boolean }) => Promise<{ id?: number }>;
    update: (id: number, options: { url: string }) => Promise<unknown>;
    get: (id: number) => Promise<{ url?: string }>;
    remove: (id: number) => Promise<void>;
  };
  runtime: { onMessage: { addListener: (listener: PriceListener) => void; removeListener: (listener: PriceListener) => void } };
}
export function resultPrice(raw: unknown, id: string, nonce: string, clubId: string): number | null {
  const message = parsePriceMessage(raw);
  if (!message || message.nonce !== nonce || message.productId !== id || normalizeClub(message.clubId) !== clubId) return null;
  if (message.status === 401 || message.status === 403 || message.error === "hidden")
    throw new CheckError(`BJ’s is hiding this member price. Sign in in its product tab, select Club ${clubId}, complete any verification, then retry.`);
  if (message.status === 429) throw new CheckError("BJ’s is limiting requests. Wait before checking again.");
  if (message.error === "network") throw new CheckError("The browser could not reach BJ’s price service. Check your connection and sign-in, then retry.");
  if (message.error === "non-json") throw new CheckError("BJ’s returned a verification page instead of price data. Complete verification in its tab and retry.");
  if (message.status === null || message.status < 200 || message.status >= 300) throw new CheckError("BJ’s price service is unavailable. Try again later.");
  if (message.error || message.price === null || message.price <= 0) throw new CheckError(`BJ’s did not return a valid price for Club ${clubId}. No price was saved. Check the product tab and retry.`);
  return message.price;
}
export async function readPriceInTab(item: CheckItem, { browser = chrome, randomUUID = () => crypto.randomUUID(), timeoutMs = APP.checkTimeoutMs }: {
  browser?: BrowserReaderApi; randomUUID?: () => string; timeoutMs?: number;
} = {}): Promise<number> {
  const id = productId(item.url);
  if (!id) throw new CheckError("This item needs a valid BJ’s product link.");
  const clubId = normalizeClub(item.clubId);
  if (!/^[1-9]\d{0,5}$/.test(clubId)) throw new CheckError("This item has no recorded club number. Import a verified purchase location first.");
  const nonce = randomUUID();
  const url = new URL(item.url);
  url.hash = new URLSearchParams({ "cpw-check": nonce, "cpw-club": clubId }).toString();
  const tab = await browser.tabs.create({ url: "about:blank", active: false });
  if (tab.id === undefined) throw new CheckError("The product tab could not be opened.");
  const tabId = tab.id;
  let listener: PriceListener | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let succeeded = false;
  try {
    const response = new Promise<number>((resolve, reject) => {
      listener = (message, sender) => {
        if (sender.tab?.id !== tabId || sender.frameId !== 0 || productId(sender.url) !== id) return;
        try { const price = resultPrice(message, id, nonce, clubId); if (price !== null) resolve(price); }
        catch (error) { reject(error); }
      };
      browser.runtime.onMessage.addListener(listener);
      timeout = setTimeout(() => reject(new CheckError("No price arrived. Check the BJ’s tab for sign-in or verification, then retry.")), timeoutMs);
    });
    response.catch(() => {});
    await browser.tabs.update(tabId, { url: url.href });
    const price = await response;
    succeeded = true;
    return price;
  } finally {
    clearTimeout(timeout);
    if (listener) browser.runtime.onMessage.removeListener(listener);
    if (succeeded) try {
      const current = await browser.tabs.get(tabId);
      if (current.url && productId(current.url) === id && new URL(current.url).hash === url.hash) await browser.tabs.remove(tabId);
    } catch { /* The user may have closed the temporary tab already. */ }
  }
}
