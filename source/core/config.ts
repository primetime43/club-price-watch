/** Deployment and browser identity. All other targets import or generate from this. */
export const APP = {
  name: "Club Price Watch",
  version: "2.1.13",
  protocolVersion: 2,
  siteOrigin: "http://localhost:3000",
  extensionId: "jikdpkkcmnlnadighofmmofapcmbkmaj",
  clubId: "555",
  clubName: "Example club",
  // Example settings: configure your club and nearby locator URL before live use.
  clubLocatorUrl: "https://www.bjs.com/clubLocator",
  bjsHome: "https://www.bjs.com/",
  priceEndpoint: "https://api.bjs.com/digital/live/api/v1.0/product/price/10201",
  publicClientId: "54b73032-9147-44f6-97f5-e1573b6e199d",
  checkTimeoutMs: 120_000,
  jobTimeoutMs: 180_000,
  requestTimeoutMs: 30_000,
} as const;

export function isWatchlistUrl(value: unknown, siteOrigin: string = APP.siteOrigin): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === siteOrigin && url.pathname === "/";
  } catch { return false; }
}

export function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}
