"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckSession } from "../../core/check-session.ts";
import type { CheckState } from "../../core/checks.ts";
import type { TrackedItem } from "../../core/items.ts";
import { isCompatibleProtocol, parseSiteReply } from "../../core/protocol.ts";

export function useBrowserChecker(items: TrackedItem[], refresh: () => void, notice: (message: string) => void) {
  const [connected, setConnected] = useState(false);
  const [opening, setOpening] = useState(false);
  const [states, setStates] = useState<Record<string, CheckState>>({});
  const session = useRef<CheckSession | null>(null);
  useEffect(() => {
    const checks = new CheckSession({ state: (states, opening) => { setStates(states); setOpening(opening); }, refresh, notice });
    session.current = checks;
    const requestId = crypto.randomUUID();
    const ping = () => window.postMessage({ type: "CPW_CHECKER_PING", requestId }, location.origin);
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const message = parseSiteReply(event.data);
      if (!message) return;
      if (message.type === "CPW_CHECKER_READY" && message.requestId === requestId) setConnected(isCompatibleProtocol(message.protocolVersion));
      else if (message.type === "CPW_CHECK_STATES" && message.requestId === requestId) checks.progress(message.states);
      else checks.receive(message);
    };
    window.addEventListener("message", receive);
    window.addEventListener("focus", ping);
    const timers = [0, 1000, 3000].map(delay => window.setTimeout(ping, delay));
    const poll = window.setInterval(ping, 5000);
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("focus", ping);
      timers.forEach(timer => clearTimeout(timer));
      clearInterval(poll);
      checks.dispose();
      session.current = null;
    };
  }, [refresh, notice]);
  useEffect(() => { session.current?.observe(items); }, [items]);
  const start = useCallback((itemId?: string) => {
    if (!connected) { session.current?.unavailable(itemId); return; }
    const request = session.current?.start(itemId);
    if (request) window.postMessage(request, location.origin);
  }, [connected]);
  return { connected, opening, states, start };
}
