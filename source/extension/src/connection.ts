import { APP } from "../../core/config.ts";
import { serverOrigin } from "../../core/server-origin.ts";

export async function getServerOrigin(storage: Pick<chrome.storage.StorageArea, "get"> = chrome.storage.local): Promise<string> {
  const data = await storage.get("serverOrigin");
  return data.serverOrigin === undefined ? APP.siteOrigin : serverOrigin(data.serverOrigin);
}

export function serverScript(origin: string): chrome.scripting.RegisteredContentScript {
  return { id: "cpw-nas-bridge", matches: [`${serverOrigin(origin)}/*`], js: ["site-bridge.js"], runAt: "document_idle", allFrames: false, persistAcrossSessions: true };
}

export async function registerServer(origin: string) {
  const id = "cpw-nas-bridge";
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (origin === APP.siteOrigin) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [id] });
  } else if (existing.length) await chrome.scripting.updateContentScripts([serverScript(origin)]);
  else await chrome.scripting.registerContentScripts([serverScript(origin)]);
}
