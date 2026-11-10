"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClubLocation, HistoryPoint, TrackedItem } from "../core/items.ts";
import { itemsClient } from "./hooks/use-watchlist.ts";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
// SQLite's original CURRENT_TIMESTAMP values are UTC without an explicit suffix.
const timestamp = (value: string) => Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(" ", "T") + "Z" : value);
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "long" }).format(timestamp(value));
const recordDate = (point: HistoryPoint) => point.source === "purchase" ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(timestamp(point.checkedAt)) : date(point.checkedAt);
const shortDate = (value: string, purchase = false) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", ...(purchase ? { timeZone: "UTC" } : {}) }).format(timestamp(value));
const location = (point: ClubLocation) => point.clubId && point.clubName ? `${point.clubName} · Club ${point.clubId}` : "Location not recorded";
const PAGE_SIZE = 50;

function HistoryChart({ points }: { points: HistoryPoint[] }) {
  const [selected, setSelected] = useState(points.length - 1);
  const index = Math.min(selected, points.length - 1);
  const point = points[index];
  const plot = useMemo(() => {
    const times = points.map(p => timestamp(p.checkedAt));
    const low = Math.min(...points.map(p => p.priceCents));
    const high = Math.max(...points.map(p => p.priceCents));
    const padding = Math.max(1, (high - low) * .15);
    const min = Math.max(0, low - padding), max = high + padding;
    const start = times[0], end = times[times.length - 1];
    const positions = points.map((p, i) => ({
      x: end === start ? 390 : 85 + ((times[i] - start) / (end - start)) * 615,
      y: 210 - ((p.priceCents - min) / (max - min)) * 175,
    }));
    return { positions, min, max };
  }, [points]);
  const position = plot.positions[index];
  return <div className="history-chart">
    <svg viewBox="0 0 730 255" role="img" aria-label="Recorded prices over time. Use the check slider below to inspect exact values." onClick={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width * 730;
      let nearest = 0;
      plot.positions.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(plot.positions[nearest].x - x)) nearest = i; });
      setSelected(nearest);
    }}>
      {[0, .5, 1].map(fraction => {
        const y = 210 - fraction * 175;
        return <g key={fraction}><line x1="85" x2="700" y1={y} y2={y} stroke="var(--line)" /><text x="75" y={y + 4} textAnchor="end">{money(Math.round(plot.min + fraction * (plot.max - plot.min)))}</text></g>;
      })}
      <polyline points={plot.positions.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinejoin="round" />
      {points.length <= 100 && plot.positions.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--red)" />)}
      <line x1={position.x} x2={position.x} y1="30" y2="210" stroke="var(--red)" strokeDasharray="4 4" opacity=".4" />
      <circle cx={position.x} cy={position.y} r="6" fill="var(--red)" stroke="white" strokeWidth="2" />
      <text x="85" y="242">{shortDate(points[0].checkedAt, points[0].source === "purchase")}</text>
      {points.length > 1 && <text x="700" y="242" textAnchor="end">{shortDate(points[points.length - 1].checkedAt, points[points.length - 1].source === "purchase")}</text>}
    </svg>
    <label className="history-slider">Inspect a recorded price
      <input type="range" min="0" max={points.length - 1} value={index} disabled={points.length === 1} onChange={event => setSelected(Number(event.target.value))} aria-valuetext={`${money(point.priceCents)}, ${recordDate(point)}, ${location(point)}`} />
    </label>
    <p className="history-selected"><strong>{money(point.priceCents)}</strong><span>{recordDate(point)}<br />{point.source === "purchase" ? "Purchase · " : ""}{location(point)}</span></p>
  </div>;
}

export default function PriceHistory({ item, onClose }: { item: TrackedItem; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void itemsClient.history(item.id, controller.signal).then(history => {
      if (!controller.signal.aborted) { setPoints(history); setPage(0); }
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load price history.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [item.id, item.lastCheckedAt, retry]);
  const prices = points.map(p => p.priceCents);
  const pages = Math.ceil(points.length / PAGE_SIZE);
  const rows = points.slice().reverse().slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return <dialog ref={dialog} className="modal history-dialog" aria-labelledby="history-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  } }}>
    <button autoFocus className="modal-close" onClick={onClose} aria-label="Close price history">
      <img src="/icons/close.svg" width="14" height="14" alt="" />
    </button>
    <p className="modal-step">PRICE HISTORY</p>
    <h2 id="history-title">{item.name}</h2>
    <p className="modal-intro">{location(item)}<br /><a href={item.url} target="_blank" rel="noreferrer">View product at BJ’s ↗</a></p>
    {loading ? <p role="status">Loading saved history…</p> : error ? <p className="form-message" role="alert">{error} <button className="secondary" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : !points.length ? <div className="history-empty"><h3>No price history yet</h3><p>A saved price check will appear here. Failed checks and tests do not add prices.</p></div> : <>
      <div className="history-summary"><div><span>Recorded prices</span><strong>{points.length.toLocaleString()}</strong></div><div><span>Lowest recorded</span><strong>{money(Math.min(...prices))}</strong></div><div><span>Highest recorded</span><strong>{money(Math.max(...prices))}</strong></div></div>
      <HistoryChart key={`${item.id}-${points.length}-${points.at(-1)?.checkedAt}`} points={points} />
      <p className="history-note">All saved records are included, including starting prices and imported purchases. Purchase dates have no recorded time; purchase records show their recorded pickup location when available. Lines connect recorded values; prices between checks are unknown. Each record shows its saved location; unknown locations are not inferred.</p>
      <div className="history-table-wrap" tabIndex={0} role="region" aria-label="Exact recorded prices">
        <table className="history-table"><caption>Recorded prices · newest first · times shown in your local time zone</caption><thead><tr><th scope="col">Recorded date</th><th scope="col">Source</th><th scope="col">Price</th><th scope="col">Recorded location</th></tr></thead><tbody>
          {rows.map((point, index) => <tr key={point.id ?? `${page}-${index}`}><td><time dateTime={new Date(timestamp(point.checkedAt)).toISOString()}>{recordDate(point)}</time></td><td>{point.source === "purchase" ? "Purchase" : "Price record"}</td><td>{money(point.priceCents)}</td><td>{location(point)}</td></tr>)}
        </tbody></table>
      </div>
      {pages > 1 && <nav className="history-pagination" aria-label="History pages"><button className="secondary" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Newer</button><span>Page {page + 1} of {pages}</span><button className="secondary" disabled={page + 1 === pages} onClick={() => setPage(value => value + 1)}>Older</button></nav>}
    </>}
  </dialog>;
}
