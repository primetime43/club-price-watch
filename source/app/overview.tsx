"use client";
import { useEffect, useState } from "react";
import { APP } from "../core/config.ts";
import type { TrackedItem } from "../core/items.ts";
import type { OverviewData, OverviewRow } from "../core/overview.ts";

const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
const signed = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;
const percent = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
const month = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value + "-01T00:00:00Z"));

export default function Overview({ items, onHistory }: { items: TrackedItem[]; onHistory: (id: string) => void }) {
  const [clubId, setClubId] = useState<string>("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/overview?${clubId ? `clubId=${encodeURIComponent(clubId)}&` : ""}includeArchived=${includeArchived ? "1" : "0"}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(APP.requestTimeoutMs)]) })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not load overview."); return result as OverviewData; })
      .then(result => { if (!controller.signal.aborted) { setData(result); setError(null); } })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load overview."); });
    return () => controller.abort();
  }, [items, clubId, includeArchived, retry]);
  const choices = data?.clubs ?? [];
  const current = data && (!clubId || data.clubId === clubId) && data.includeArchived === includeArchived ? data : null;
  const driverList = (rows: OverviewRow[], label: string) => <div><h4>{label}</h4>{rows.length ? <ul className="insight-list">{rows.map(row => <li key={row.id}><button onClick={() => onHistory(row.id)}>{row.name}</button><strong className={row.delta < 0 ? "insight-down" : "insight-up"}>{signed(row.delta)} <small>({percent(row.percent)})</small></strong><span>{money(row.previous)} last paid → {money(row.current)} latest{row.stale ? " · stale price" : ""}</span></li>)}</ul> : <p>No comparable {label.toLowerCase()}.</p>}</div>;
  const maxMovement = Math.max(1, ...(current?.trend.map(p => Math.abs(p.percent ?? 0)) ?? []));
  return <section className="overview" aria-label="All-data price overview">
    <div className="overview-controls"><label>Recorded club<select value={clubId} onChange={event => setClubId(event.target.value)}><option value="">Automatic · recorded club</option>{choices.map(club => <option key={club.id} value={club.id}>{club.name} · Club {club.id}</option>)}</select></label><label className="overview-check"><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} /> Include archived items</label></div>
    {error && <p className="load-error" role="alert">{error} {current && "Last loaded overview is shown."} <button className="secondary" onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    {!current ? <p role="status">{error ? "Overview unavailable." : "Loading full saved history…"}</p> : <>
      <p className="overview-note">{current.clubName} · Club {current.clubId} · {includeArchived ? "Active and archived items" : "Active items"}. One retail package per product; these are recorded price comparisons, not spending or realized savings. Updated {new Date(current.generatedAt).toLocaleTimeString()}.</p>
      <div className="overview-grid">
        <article className="insight-panel insight-wide" aria-labelledby="basket-title"><p className="eyebrow">01 · YOUR BASKET TODAY</p><h3 id="basket-title">What would the same products cost now?</h3>
          <div className="insight-metrics"><div><span>At last purchase prices</span><strong>{money(current.basket.previous)}</strong></div><div><span>At latest saved prices</span><strong>{money(current.basket.current)}</strong></div><div><span>Difference · one of each</span><strong className={(current.basket.delta ?? 0) < 0 ? "insight-down" : ""}>{signed(current.basket.delta)}</strong><span>{percent(current.basket.percent)}</span></div></div>
          <p>{current.basket.matched} of {current.basket.eligible} items have a comparable purchase at this club, dated no later than their latest saved price. Each product uses its own last purchase date. {current.basket.stale > 0 && `${current.basket.stale} compared prices are at least 7 days old.`}</p>
          {!current.basket.matched && <p>Import purchase history at this club to start this comparison.</p>}
          <p className="overview-note">All {current.basket.currentCount} items with dated saved prices in this view total {money(current.basket.currentTotal)} for one of each. Products without a purchase baseline are excluded from the paired basket above. Taxes and quantities are not included.</p>
        </article>
        <article className="insight-panel insight-wide" aria-labelledby="movement-title"><p className="eyebrow">02 · PRICE MOVEMENT</p><h3 id="movement-title">Where increases and decreases cancel out</h3>
          <div className="insight-metrics"><div><span>More expensive than last paid</span><strong className="insight-up">{current.movement.up}</strong></div><div><span>Cheaper than last paid</span><strong className="insight-down">{current.movement.down}</strong></div><div><span>Unchanged</span><strong>{current.movement.unchanged}</strong></div></div>
          <p>Same {current.basket.matched} matched products as the basket. Biggest dollar contributors per retail package:</p>
          <div className="insight-drivers">{driverList(current.movement.increases, "Largest increases")}{driverList(current.movement.decreases, "Largest decreases")}</div>
        </article>
        <article className="insight-panel insight-wide" aria-labelledby="opportunities-title"><p className="eyebrow">03 · BUYING OPPORTUNITIES</p><h3 id="opportunities-title">Prices worth a closer look</h3><p>Click an item to inspect its history. Recorded lows require an earlier same-club observation; stale prices should be checked before shopping.</p>
          {!current.opportunities.length ? <p>No recorded opportunities in this view yet.</p> : <details open><summary>{current.opportunities.length} items at a recorded low, below last paid or at target</summary><div className="insight-table-wrap" tabIndex={0} role="region" aria-label="Buying opportunity records"><table className="insight-table"><thead><tr><th>Item</th><th>Latest price</th><th>Why it stands out</th><th>Saved date</th></tr></thead><tbody>{current.opportunities.map(item => <tr key={item.id}><td><button onClick={() => onHistory(item.id)}>{item.name}</button></td><td>{money(item.current)}</td><td>{[item.low ? "At recorded low" : "", item.belowPurchase > 0 ? `${money(item.belowPurchase)} below last paid` : "", item.target ? "Target reached" : ""].filter(Boolean).join(" · ")}</td><td>{date(item.checkedAt)}{item.stale && <strong className="insight-up"> · Stale (7+ days)</strong>}</td></tr>)}</tbody></table></div></details>}
        </article>
        <article className="insight-panel insight-wide" aria-labelledby="trend-title"><p className="eyebrow">04 · OVER TIME</p><h3 id="trend-title">Monthly movement for matched products</h3><p>Latest observation per product in each calendar month, compared only with that same product in the immediately preceding month. Purchase and other saved price records are included. Each month can have a different matched group; this is not a cumulative price index.</p>
          {!current.trend.some(row => row.matched > 0) && <p>No adjacent months with matching products yet. Gaps stay unknown rather than carrying prices forward.</p>}
          <div className="movement-chart" role="img" aria-label="Monthly matched-product price changes. Exact figures and sample counts are in the table below.">{current.trend.map(row => { const width = Math.abs(row.percent ?? 0) / maxMovement * 46; return <div className="movement-month" key={row.month}><span>{month(row.month)}</span><div className="movement-track"><i style={{ left: `${(row.percent ?? 0) < 0 ? 50 - width : 50}%`, width: `${width}%`, background: (row.percent ?? 0) < 0 ? "var(--green)" : "var(--red)" }} /></div><strong>{row.percent === null ? "No comparison" : percent(row.percent)}</strong></div>; })}</div>
          <details><summary>Exact monthly figures and coverage</summary><div className="insight-table-wrap" tabIndex={0} role="region" aria-label="Monthly comparison figures"><table className="insight-table"><thead><tr><th>Month</th><th>Products observed</th><th>Matched with prior month</th><th>Prior matched basket</th><th>This matched basket</th><th>Change</th></tr></thead><tbody>{current.trend.map(row => <tr key={row.month}><td>{month(row.month)}</td><td>{row.observed}</td><td>{row.matched}</td><td>{money(row.previous)}</td><td>{money(row.current)}</td><td>{percent(row.percent)}</td></tr>)}</tbody></table></div></details>
          <p className="overview-note">Up to the latest 24 calendar months, using UTC month boundaries. The current month is partial. Purchase dates retain their recorded day. Missing months are not interpolated. Newly added products affect a comparison only when they have observations in both months.</p>
        </article>
        <article className="insight-panel insight-wide" aria-labelledby="coverage-title"><p className="eyebrow">05 · DATA COVERAGE</p><h3 id="coverage-title">How much history supports these insights?</h3>
          <div className="insight-metrics"><div><span>Items in this view</span><strong>{current.coverage.items}</strong></div><div><span>Same-club history records</span><strong>{current.coverage.records}</strong></div><div><span>Items with two or more dated observations</span><strong>{current.coverage.enoughHistory}</strong></div></div>
          <dl className="coverage-list"><div><dt>Saved less than 7 days ago</dt><dd>{current.coverage.fresh}</dd></div><div><dt>Saved 7+ days ago</dt><dd>{current.coverage.stale}</dd></div><div><dt>Missing or invalid saved date</dt><dd>{current.coverage.undated}</dd></div><div><dt>No positive current price</dt><dd>{current.coverage.missingPrice}</dd></div><div><dt>Imported purchase prices</dt><dd>{current.coverage.purchases}</dd></div><div><dt>Other price records (checks / starting prices)</dt><dd>{current.coverage.otherPriceRecords}</dd></div><div><dt>Unknown-location records excluded from this view’s comparisons</dt><dd>{current.coverage.unknownRecords}</dd></div><div><dt>Other-club records excluded from this view’s comparisons</dt><dd>{current.coverage.otherClubRecords}</dd></div><div><dt>Future or invalid records excluded</dt><dd>{current.coverage.futureRecords + current.coverage.invalidRecords}</dd></div></dl>
          <p>{current.coverage.first && current.coverage.last ? `Usable history spans ${date(current.coverage.first)} through ${date(current.coverage.last)}.` : "No usable same-club history yet."} A small sample describes recorded observations; it cannot establish sale cycles or predict future prices.</p>
          <p className="overview-note">Entire database: {current.coverage.databaseItems} products, {current.coverage.archivedItems} archived, {current.coverage.databaseRecords} history records, including {current.coverage.databaseUnknownRecords} with unknown location. All full history is read; the watchlist’s 60-record limit does not apply. Unknown locations are never assigned to the selected club.</p>
        </article>
      </div>
    </>}
  </section>;
}
