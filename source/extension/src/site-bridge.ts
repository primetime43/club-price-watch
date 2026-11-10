import { APP, isWatchlistUrl } from "../../core/config.ts";
import { isRunnerUrl, parseRunnerFinished, parseSiteRequest, parseCheckStates } from "../../core/protocol.ts";
import type { SiteReply } from "../../core/protocol.ts";
import { getServerOrigin } from "./connection.ts";

async function connect() {
  const origin = await getServerOrigin();
  if (!isWatchlistUrl(location.href, origin)) return;
  let enabled = true;
  const publish = (message: SiteReply) => { if (enabled) window.postMessage(message, location.origin); };
  let pingId: string | undefined;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.serverOrigin) enabled = (changes.serverOrigin.newValue ?? APP.siteOrigin) === origin;
    if (!enabled) return;
    if (area === "local" && changes.checkStates && pingId)
      publish({ type: "CPW_CHECK_STATES", requestId: pingId, states: parseCheckStates(changes.checkStates.newValue) });
  });
  window.addEventListener("message", event => {
    if (!enabled) return;
    if (event.source !== window || event.origin !== location.origin) return;
    const message = parseSiteRequest(event.data);
    if (!message) return;
    if (message.type === "CPW_CHECKER_PING") {
      pingId = message.requestId;
      publish({ type: "CPW_CHECKER_READY", requestId: message.requestId, version: APP.version, protocolVersion: APP.protocolVersion });
      void chrome.storage.local.get("checkStates").then(value => publish({ type: "CPW_CHECK_STATES", requestId: message.requestId, states: parseCheckStates(value.checkStates) })).catch(() => {});
    }
    else chrome.runtime.sendMessage({ ...message, type: "CPW_OPEN_RUNNER" }).then(
      (response: unknown) => publish({ type: "CPW_CHECKER_OPENED", requestId: message.requestId, ok: typeof response === "object" && response !== null && "ok" in response && response.ok === true }),
      () => publish({ type: "CPW_CHECKER_OPENED", requestId: message.requestId, ok: false }),
    );
  });
  chrome.runtime.onMessage.addListener((raw: unknown, sender) => {
    if (!enabled) return;
    if (sender.id !== chrome.runtime.id || !isRunnerUrl(sender.url)) return;
    const message = parseRunnerFinished(raw);
    if (message) publish({ ...message, type: "CPW_CHECK_FINISHED" });
  });
}
void connect().catch(() => {});
