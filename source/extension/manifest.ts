import { APP } from "../core/config.ts";

export function extensionManifest(key: string): chrome.runtime.ManifestV3 {
  return {
    manifest_version: 3, name: APP.name, version: APP.version, key,
    description: "Check your BJ’s watchlist in normal browser tabs using your existing login.",
    permissions: ["storage"],
    optional_permissions: ["scripting"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    options_page: "settings.html",
    host_permissions: ["https://www.bjs.com/*", "https://bjs.com/*", `${APP.siteOrigin}/*`],
    icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
    action: { default_title: APP.name, default_popup: "popup.html",
      default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" } },
    background: { service_worker: "site-worker.js" },
    content_scripts: [
      { matches: ["https://www.bjs.com/product/*", "https://bjs.com/product/*"], js: ["page-hook.js"], run_at: "document_start", world: "MAIN" },
      { matches: ["https://www.bjs.com/product/*", "https://bjs.com/product/*"], js: ["bridge.js"], run_at: "document_start" },
      { matches: ["https://www.bjs.com/account/manageOrders*", "https://bjs.com/account/manageOrders*"], js: ["order-picker.js"], run_at: "document_idle" },
      { matches: [`${APP.siteOrigin}/*`], js: ["site-bridge.js"], run_at: "document_idle" },
    ],
  };
}
