import { APP } from "../../core/config.ts";
import { normalizeClub, matchesPriceResponse, productId, priceUrl, readClubPrice } from "../../core/prices.ts";
import { validNonce } from "../../core/protocol.ts";
import type { PriceMessage } from "../../core/protocol.ts";

export interface PageEnvironment {
  href: string;
  hash: string;
  fetch: typeof fetch;
  replaceFetch: (fetcher: typeof fetch) => void;
  xhrPrototype: Pick<XMLHttpRequest, "open" | "send">;
  publish: (message: PriceMessage) => void;
  delay: (callback: () => void, milliseconds: number) => unknown;
}

/** Instruments only our nonce-marked product tabs, never normal browsing tabs. */
export function installPageReader(env: PageEnvironment): void {
  const nonce = new URLSearchParams(env.hash.slice(1)).get("cpw-check");
  const id = productId(env.href);
  const clubId = normalizeClub(new URLSearchParams(env.hash.slice(1)).get("cpw-club"));
  if (!validNonce(nonce) || !id || !/^[1-9]\d{0,5}$/.test(clubId)) return;
  let published = false;
  const publish = (value: Partial<Pick<PriceMessage, "status" | "price" | "error">>) => {
    if (published) return;
    published = true;
    env.publish({ type: "CPW_PRICE_RESULT", nonce, productId: id, clubId, status: null, price: null, error: null, ...value });
  };
  const accept = (status: number, data: unknown) => {
    if (status < 200 || status >= 300) return publish({ status });
    const reading = readClubPrice(data, clubId);
    publish(reading.ok ? { status, price: reading.price } : { status, error: reading.code });
  };
  const inspect = async (response: Response, url: string) => {
    if (published || !matchesPriceResponse(url, id, clubId)) return;
    if (!response.ok) return publish({ status: response.status });
    try { accept(response.status, await response.clone().json()); }
    catch { publish({ status: response.status, error: "non-json" }); }
  };
  env.replaceFetch((input, init) => {
    const promise = env.fetch(input, init);
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    promise.then(response => inspect(response, url)).catch(() => {});
    return promise;
  });
  const marked = new WeakSet<XMLHttpRequest>();
  const originalOpen = env.xhrPrototype.open;
  const originalSend = env.xhrPrototype.send;
  env.xhrPrototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    if (matchesPriceResponse(String(args[1]), id, clubId)) marked.add(this);
    else marked.delete(this);
    return Reflect.apply(originalOpen, this, args);
  } as typeof originalOpen;
  env.xhrPrototype.send = function (this: XMLHttpRequest, ...args: Parameters<typeof originalSend>) {
    if (marked.has(this)) this.addEventListener("load", () => {
      if (published) return;
      if (this.status < 200 || this.status >= 300) return publish({ status: this.status });
      try { accept(this.status, this.responseType === "json" ? this.response : JSON.parse(this.responseText)); }
      catch { publish({ status: this.status, error: "non-json" }); }
    }, { once: true });
    return Reflect.apply(originalSend, this, args);
  };
  env.delay(() => {
    if (published) return;
    const url = priceUrl(id, clubId);
    env.fetch(url, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/json, text/plain, */*", "x-ibm-client-id": APP.publicClientId } })
      .then(response => inspect(response, url.href)).catch(() => publish({ error: "network" }));
  }, 15_000);
}
