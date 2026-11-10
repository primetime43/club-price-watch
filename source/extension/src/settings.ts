import { APP } from "../../core/config.ts";
import { serverOrigin } from "../../core/server-origin.ts";
import { getServerOrigin, registerServer } from "./connection.ts";

const form = document.querySelector<HTMLFormElement>("#connection-form")!;
const input = document.querySelector<HTMLInputElement>("#server-origin")!;
const message = document.querySelector<HTMLElement>("#message")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
getServerOrigin().then(origin => { input.value = origin; }).catch(error => { message.textContent = error.message; });
form.addEventListener("submit", async event => {
  event.preventDefault();
  save.disabled = true;
  try {
    const origin = serverOrigin(input.value);
    // Request only this chosen host, directly from the user's Save gesture.
    const granted = await chrome.permissions.request({ permissions: ["scripting"], origins: [`${origin}/*`] });
    if (!granted) throw new Error("Allow access to this app address to connect the extension.");
    const response = await fetch(`${origin}/api/items`, { cache: "no-store", signal: AbortSignal.timeout(APP.requestTimeoutMs) });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.items)) throw new Error("The app did not respond. Check its address and that the container is running.");
    const previous = await getServerOrigin();
    await registerServer(origin);
    await chrome.storage.local.set({ serverOrigin: origin });
    if (previous !== origin) await chrome.storage.local.remove(["checkStates", "lastRun"]);
    input.value = origin;
    message.textContent = "Connected. Finish any old checker runs and refresh the app and BJ’s pages before checking prices.";
  } catch (error) { message.textContent = error instanceof Error ? error.message : "Could not connect. Check the app address and retry."; }
  finally { save.disabled = false; }
});
document.querySelector<HTMLButtonElement>("#local")!.addEventListener("click", () => { input.value = APP.siteOrigin; });
