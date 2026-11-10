import { parsePriceMessage, validNonce } from "../../core/protocol.ts";

const nonce = new URLSearchParams(location.hash.slice(1)).get("cpw-check");
if (validNonce(nonce)) window.addEventListener("message", event => {
  if (event.source !== window || event.origin !== location.origin) return;
  const message = parsePriceMessage(event.data);
  if (message?.nonce === nonce) chrome.runtime.sendMessage(message).catch(() => {});
});

// This isolated UI never reads login data or page network headers.
if (!validNonce(nonce)) window.addEventListener("DOMContentLoaded", () => {
  if (!location.pathname.match(/\/\d{10,}\/?$/)) return;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:2147483647";
  const shadow = host.attachShadow({ mode: "closed" });
  const add = document.createElement("button");
  add.textContent = "+ Add to Price Watch";
  add.style.cssText = "background:#d70f46;color:white;border:0;border-radius:12px;padding:15px 20px;font:600 14px system-ui;cursor:pointer;box-shadow:0 4px 24px #0003";
  add.onclick = async () => {
    add.disabled = true; add.textContent = "Adding…";
    try {
      const result = await chrome.runtime.sendMessage({ type: "CPW_QUICK_ADD", title: document.title });
      if (!result?.ok) throw new Error();
      add.textContent = result.archived ? "Archived · restore from watchlist" : result.existing ? "Already watching ✓" : "Added · checking price ✓";
    } catch { add.textContent = "Could not add · retry"; add.disabled = false; }
  };
  shadow.append(add); document.body.append(host);
}, { once: true });
