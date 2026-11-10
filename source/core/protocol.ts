import { APP, isIdentifier } from "./config.ts";
import { record } from "./items.ts";
import type { CheckResult, CheckState } from "./checks.ts";
import type { PriceFailure } from "./prices.ts";

export type PriceCode = PriceFailure | "non-json" | "network";
export interface PriceMessage {
  type: "CPW_PRICE_RESULT";
  nonce: string;
  productId: string;
  clubId: string;
  status: number | null;
  price: number | null;
  error: PriceCode | null;
}
export interface OpenRequest { type: "CPW_OPEN_CHECKER"; requestId: string; itemId?: string; run: boolean }
export type SiteRequest = { type: "CPW_CHECKER_PING"; requestId: string } | OpenRequest;
export type SiteReply =
  | { type: "CPW_CHECK_STATES"; requestId: string; states: Record<string, CheckState> }
  | { type: "CPW_CHECKER_READY"; requestId: string; version: string; protocolVersion: number }
  | { type: "CPW_CHECKER_OPENED"; requestId: string; ok: boolean }
  | { type: "CPW_CHECK_FINISHED"; requestId: string; results: CheckResult[] };
export interface RunnerRequest { type: "CPW_OPEN_RUNNER"; requestId: string; itemId?: string; run: boolean }
export interface RunnerFinished { type: "CPW_RUN_FINISHED"; requestId: string; results: CheckResult[] }
export interface MessageSource { id?: string; frameId?: number; tab?: { id?: number }; url?: string }
export const validNonce = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);

export function parsePriceMessage(value: unknown): PriceMessage | null {
  const data = record(value);
  if (data?.type !== "CPW_PRICE_RESULT" || !validNonce(data.nonce) || typeof data.productId !== "string" || !/^\d{10,}$/.test(data.productId) || typeof data.clubId !== "string") return null;
  const codes: PriceCode[] = ["invalid-response", "wrong-club", "hidden", "invalid-offer", "missing-price", "non-json", "network"];
  return { type: "CPW_PRICE_RESULT", nonce: data.nonce, productId: data.productId, clubId: data.clubId,
    price: typeof data.price === "number" && Number.isFinite(data.price) ? data.price : null,
    status: typeof data.status === "number" && Number.isInteger(data.status) ? data.status : null,
    error: codes.includes(data.error as PriceCode) ? data.error as PriceCode : null };
}
export function parseSiteRequest(value: unknown): SiteRequest | null {
  const data = record(value);
  if (!data || !isIdentifier(data.requestId)) return null;
  if (data.type === "CPW_CHECKER_PING") return { type: data.type, requestId: data.requestId };
  if (data.type !== "CPW_OPEN_CHECKER" || (data.itemId != null && !isIdentifier(data.itemId))) return null;
  const itemId = typeof data.itemId === "string" ? data.itemId : undefined;
  if (data.run === true && !itemId) return null;
  return { type: data.type, requestId: data.requestId, itemId, run: data.run === true };
}
export function parseResults(value: unknown): CheckResult[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const results: CheckResult[] = [];
  for (const raw of value) {
    const data = record(raw);
    if (!data || !isIdentifier(data.id) || !["recorded", "tested", "failed"].includes(String(data.status))) return null;
    results.push({ id: data.id, status: data.status as CheckResult["status"], error: data.status === "failed" && typeof data.error === "string" ? data.error.slice(0, 500) : undefined });
  }
  return results;
}
export function parseSiteReply(value: unknown): SiteReply | null {
  const data = record(value);
  if (!data || !isIdentifier(data.requestId)) return null;
  if (data.type === "CPW_CHECK_STATES") return { type: data.type, requestId: data.requestId, states: parseCheckStates(data.states) };
  if (data.type === "CPW_CHECKER_READY" && typeof data.version === "string" && typeof data.protocolVersion === "number")
    return { type: data.type, requestId: data.requestId, version: data.version, protocolVersion: data.protocolVersion };
  if (data.type === "CPW_CHECKER_OPENED" && typeof data.ok === "boolean") return { type: data.type, requestId: data.requestId, ok: data.ok };
  const results = parseResults(data.results);
  return data.type === "CPW_CHECK_FINISHED" && results ? { type: data.type, requestId: data.requestId, results } : null;
}
export function parseCheckStates(value: unknown): Record<string, CheckState> {
  const source = record(value);
  const states: Record<string, CheckState> = {};
  for (const [id, value] of Object.entries(source ?? {}).slice(0, 200)) {
    const row = record(value);
    if (!isIdentifier(id) || !row || !["waiting", "checking", "saved", "failed", "tested"].includes(String(row.status)) ||
        typeof row.message !== "string" || typeof row.updatedAt !== "number" || !Number.isFinite(row.updatedAt) || row.updatedAt <= 0) continue;
    Object.defineProperty(states, id, { enumerable: true, configurable: true, writable: true,
      value: { status: row.status, message: row.message.slice(0, 500), updatedAt: row.updatedAt } });
  }
  return states;
}
export function isCompatibleProtocol(version: number): boolean { return version === APP.protocolVersion; }

export function parseRunnerRequest(value: unknown): RunnerRequest | null {
  const data = record(value);
  if (data?.type !== "CPW_OPEN_RUNNER") return null;
  const request = parseSiteRequest({ ...data, type: "CPW_OPEN_CHECKER" });
  return request?.type === "CPW_OPEN_CHECKER" ? { ...request, type: "CPW_OPEN_RUNNER" } : null;
}
export function parseRunnerFinished(value: unknown): RunnerFinished | null {
  const data = record(value);
  const results = parseResults(data?.results);
  return data?.type === "CPW_RUN_FINISHED" && isIdentifier(data.requestId) && results
    ? { type: "CPW_RUN_FINISHED", requestId: data.requestId, results } : null;
}
export function runnerUrl(request?: Pick<OpenRequest, "itemId" | "run" | "requestId">, sourceTab?: number): URL {
  const url = new URL(`chrome-extension://${APP.extensionId}/runner.html`);
  if (request?.itemId) url.searchParams.set("itemId", request.itemId);
  if (request?.run) url.searchParams.set("mode", "check");
  if (request && Number.isSafeInteger(sourceTab) && sourceTab! >= 0) {
    url.searchParams.set("requestId", request.requestId);
    url.searchParams.set("sourceTab", String(sourceTab));
  }
  return url;
}
export function isRunnerUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "chrome-extension:" && url.hostname === APP.extensionId && url.pathname === "/runner.html";
  } catch { return false; }
}
