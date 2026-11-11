"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { TrackedItem } from "../core/items.ts";
import { APP } from "../core/config.ts";
import { clubNumber } from "../core/clubs.ts";
import { itemCheckState } from "../core/checks.ts";
import { priceChange as changeFor, targetReached, watchlistView } from "../core/watchlist-view.ts";
import type { WatchlistFilter, WatchlistSort } from "../core/watchlist-view.ts";
import { useWatchlist, itemsClient } from "./hooks/use-watchlist.ts";
import { useBrowserChecker } from "./hooks/use-browser-checker.ts";
import BackupControls from "./backup-controls.tsx";
import MergeItems from "./merge-items.tsx";
import Overview from "./overview.tsx";
import PriceHistory from "./price-history.tsx";

const money = (cents: number | null) =>
  cents === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

function relativeTime(value: string | null) {
  if (!value) return "Not checked yet";
  const hours = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 3600000));
  if (hours < 1) return "Checked just now";
  if (hours < 24) return `Checked ${hours}h ago`;
  return `Checked ${Math.round(hours / 24)}d ago`;
}

function recordedRange(item: TrackedItem) {
  const prices = item.history.map((point) => point.priceCents);
  if (!prices.length) return null;
  return { low: Math.min(...prices), high: Math.max(...prices), checks: prices.length };
}

function SparkBars({ item }: { item: TrackedItem }) {
  if (!item.history.length && item.currentPriceCents === null) {
    return <div className="spark empty-spark" aria-label="No recorded price history">No price history yet</div>;
  }
  const points = item.history.length ? item.history.map((point) => point.priceCents) : [item.currentPriceCents ?? 0];
  const min = Math.min(...points);
  const max = Math.max(...points);
  return (
    <div className="spark" aria-label="Price trend across the latest checks">
      {points.slice(-16).map((point, index) => {
        const height = max === min ? 46 : 24 + ((point - min) / (max - min)) * 40;
        return <span key={`${point}-${index}`} style={{ height: `${height}%` }} />;
      })}
    </div>
  );
}

export default function PriceTracker() {
  const { items, loading, error, refresh: loadItems } = useWatchlist();
  const activeItems = useMemo(() => items.filter(item => item.archivedAt === null), [items]);
  const archivedCount = items.length - activeItems.length;
  const [archiving, setArchiving] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [shoppingBusy, setShoppingBusy] = useState<string | null>(null);
  const [shoppingError, setShoppingError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const watchlistRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = watchlistRef.current;
    if (!list) return;
    // Bring the whole list box into view before the wheel starts scrolling rows.
    // A native non-passive listener lets us cancel only that initial inner scroll.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || event.deltaY <= 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.cancelable) return;
      if (list.scrollHeight <= list.clientHeight) return;
      const remaining = list.getBoundingClientRect().bottom - (window.innerHeight - 16);
      const pageRemaining = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      if (remaining <= 1 || pageRemaining <= 1) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? window.innerHeight : 1);
      event.preventDefault();
      window.scrollBy({ top: Math.min(delta, remaining, pageRemaining), behavior: "instant" });
    };
    list.addEventListener("wheel", onWheel, { passive: false });
    return () => list.removeEventListener("wheel", onWheel);
  }, []);

  const [view, setView] = useState<"watchlist" | "overview">("watchlist");
  const [search, setSearch] = useState("");
  const [mergeItem, setMergeItem] = useState<TrackedItem | null>(null);
  const [historyItemId, setHistoryItemId] = useState<string | null>(null);
  const historyItem = items.find(item => item.id === historyItemId);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<TrackedItem | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<TrackedItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", targetPrice: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [filter, setFilter] = useState<WatchlistFilter>("all");
  const [sort, setSort] = useState<WatchlistSort>("added");
  const [addOpen, setAddOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ url: "", name: "", currentPrice: "", targetPrice: "", itemNumber: "", imageUrl: "", clubId: "" });
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const { connected: checkerReady, opening: checkerOpening, states: checkStates, start: openChecker } = useBrowserChecker(activeItems, loadItems, setNotice);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { if (watchlistRef.current) watchlistRef.current.scrollTop = 0; }, [filter, sort, search]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filtered = useMemo(() => watchlistView(items, filter, sort, search, checkStates, now), [filter, sort, items, search, checkStates, now]);

  const stats = useMemo(() => {
    const drops = activeItems.filter((item) => (changeFor(item) ?? 0) < 0);
    const saved = drops.reduce((sum, item) => sum + Math.abs(changeFor(item) ?? 0), 0);
    const atTarget = activeItems.filter(targetReached).length;
    return { drops: drops.length, saved, atTarget };
  }, [activeItems]);

  async function changeArchive(item: TrackedItem) {
    if (archiving) return;
    setArchiving(item.id); setArchiveError(null);
    try {
      const archived = item.archivedAt === null;
      await itemsClient.archive(item.id, archived);
      await loadItems();
      setNotice(archived ? "Item archived. Find it in Archived; its price history is kept." : "Item restored to your watchlist.");
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : "Could not update this item. Try again.");
    } finally { setArchiving(null); }
  }

  async function changeShoppingList(item: TrackedItem) {
    if (shoppingBusy) return;
    setShoppingBusy(item.id); setShoppingError(null);
    try {
      await itemsClient.shoppingList(item.id, !item.onShoppingList);
      await loadItems();
      setNotice(item.onShoppingList ? "Item removed from your shopping list." : "Item added to your shopping list.");
    } catch (error) {
      setShoppingError(error instanceof Error ? error.message : "Could not update your shopping list. Try again.");
    } finally { setShoppingBusy(null); }
  }

  function resetAdd() {
    setForm({ url: "", name: "", currentPrice: "", targetPrice: "", itemNumber: "", imageUrl: "", clubId: "" });
    setFormMessage(null);
    setAddOpen(false);
  }

  async function previewLink() {
    if (!form.url) {
      setFormMessage("Paste the BJ’s product link first.");
      return;
    }
    setPreviewing(true);
    setFormMessage(null);
    try {
      const preview = await itemsClient.preview(form.url);
      setForm((current) => ({
        ...current,
        name: preview.name || current.name,
        imageUrl: preview.imageUrl || current.imageUrl,
        itemNumber: preview.itemNumber || current.itemNumber,
        currentPrice: preview.price ? preview.price.toFixed(2) : current.currentPrice,
      }));
      setFormMessage(
        preview.price
          ? "Product and current price found."
          : "Product name found. Saving starts its first browser price check when the Club Price Watch extension is connected.",
      );
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Could not read that link.");
    } finally {
      setPreviewing(false);
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormMessage(null);
    try {
      const recordedClub = form.clubId ? clubNumber(form.clubId) : null;
      if (form.clubId && !recordedClub) throw new Error("Enter a valid recorded club number.");
      const result = await itemsClient.add({
        ...form,
        clubId: recordedClub, clubName: recordedClub ? `Club ${recordedClub}` : null,
        currentPrice: form.currentPrice ? Number(form.currentPrice) : null,
        targetPrice: form.targetPrice ? Number(form.targetPrice) : null,
      });
      resetAdd();
      await loadItems();
      if (result.item.archivedAt !== null) {
        setFilter("archived"); setSearch("");
        setNotice("This product is archived. Choose Restore to bring it back with its history.");
      }
      else if (result.existing) setNotice("Already in your watchlist. Existing details and price history were kept.");
      else if (!result.item.clubId) setNotice("Item added. Set its recorded club number before checking.");
      else if (!form.currentPrice) openChecker(result.item.id);
      else setNotice("Item added to your watchlist.");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Could not save that item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Club Price Watch home">
          <span className="brand-mark">↘</span>
          <span>Club Price Watch</span>
        </a>
        <div className="top-actions">
          <button className="primary small" onClick={() => setAddOpen(true)}>＋ Add item</button>
        </div>
      </header>

      <section className="dashboard-intro" id="top"><div><p className="eyebrow">YOUR CLUB. YOUR PRICES.</p><h1>Track prices.<br />See the history.</h1><p>Your watchlist, with every price check in one place.</p></div><aside><span>QUICK ADD WHILE YOU SHOP</span><strong>See it on BJ’s? Watch it here.</strong><p>Use Add to Price Watch on a product page, or open the extension and choose Add current product.</p><button className="secondary" onClick={() => setAddOpen(true)}>Or paste a product link →</button></aside></section>

      <section className="workspace" id="watchlist">
        <nav className="view-tabs" aria-label="Watchlist views"><button aria-pressed={view === "watchlist"} onClick={() => setView("watchlist")}>Watchlist</button><button aria-pressed={view === "overview"} onClick={() => setView("overview")}>Overview</button></nav>
        <div className="summary-row" hidden={view !== "watchlist"}>
          <article className="summary-card">
            <span className="summary-icon rose">◎</span>
            <div><span>Items tracked</span><strong>{activeItems.length}</strong></div>
            <em>Your watchlist</em>
          </article>
          <article className="summary-card">
            <span className="summary-icon green">↘</span>
            <div><span>Price drops</span><strong>{stats.drops}</strong></div>
            <em className="good">{money(stats.saved)} lower</em>
          </article>
          <article className="summary-card">
            <span className="summary-icon gold">☆</span>
            <div><span>At target</span><strong>{stats.atTarget}</strong></div>
            <em>Ready to buy</em>
          </article>
        </div>

        <div className="watch-head">
          <div>
            <div className="title-line"><h2>{view === "overview" ? "Your price overview" : filter === "archived" ? "Archived items" : "Your watchlist"}</h2></div>
            <p>{view === "overview" ? "The bigger picture across your saved prices and purchase history." : filter === "archived" ? "Prices and history are kept. Restore an item whenever you need it again." : "One place to spot what moved—and what’s worth waiting for."}</p>
            <p className={`checker-connection ${checkerReady ? "connected" : "disconnected"}`}>{checkerReady ? "Browser checker connected · New items get a first price check when saved." : "Connect the browser extension to check prices and quick-add products from BJ’s."}</p>
            {!checkerReady && <details className="extension-setup">
              <summary>Set up the browser extension</summary>
              <p>Open <strong>Start Club Price Watch.bat</strong> and press <strong>S</strong>. Setup opens your browser’s Extensions page and copies the extension folder path.</p>
              <ol>
                <li>Turn on <strong>Developer mode</strong>.</li>
                <li>Click <strong>Load unpacked</strong>.</li>
                <li>In the folder picker, press <strong>Ctrl+L</strong>, then <strong>Ctrl+V</strong>, then Enter. Click <strong>Select Folder</strong>.</li>
                <li>Refresh this page. The status above will show when the extension connects.</li>
              </ol>
              <p>Already installed? Click Reload on its extension card, then refresh this page. Keep the extension folder in place.</p>
              <p>Using the NAS app? Open the extension’s <strong>Server address</strong> setting, enter this app’s address, then Save &amp; connect and refresh.</p>
            </details>}
          </div>
          <div className="watch-actions">
            <BackupControls onRestored={loadItems} />
            {(view === "overview" || filter !== "archived") && <button className="secondary check-prices" onClick={() => openChecker()} disabled={checkerOpening}>{checkerOpening ? "Opening checker…" : "Check prices now"}</button>}
          </div>
        </div>

        {view === "overview" && <Overview items={items} onHistory={setHistoryItemId} />}
        <div hidden={view !== "watchlist"}>
        <div className="watchlist-controls">
          <label className="watchlist-search">{filter === "archived" ? "Search archived items" : "Search your watchlist"}<input type="search" placeholder="Find an item…" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label>Show<select value={filter} onChange={event => setFilter(event.target.value as WatchlistFilter)}>
            <option value="all">All active ({activeItems.length})</option>
            <option value="drops">Price drops</option>
            <option value="needs">Needs checking</option>
            <option value="failed">Failed checks</option>
            <option value="target">Target reached</option>
            <option value="shopping">Shopping list ({activeItems.filter(item => item.onShoppingList).length})</option>
            <option value="archived">Archived ({archivedCount})</option>
          </select></label>
          <label>Sort by<select value={sort} onChange={event => setSort(event.target.value as WatchlistSort)}>
            <option value="added">Newest added</option>
            <option value="drop">Biggest price drop</option>
            <option value="oldest">Oldest check first</option>
            <option value="target">Closest to target</option>
          </select></label>
          {(filter !== "all" || sort !== "added" || search) && <button className="secondary reset-view" onClick={() => { setFilter("all"); setSort("added"); setSearch(""); }}>Reset</button>}
        </div>
        <p className="watchlist-view-note"><span role="status">Showing {filtered.length} of {filter === "archived" ? archivedCount : activeItems.length} {filter === "archived" ? "archived" : "active"} items.</span>{filter === "needs" && " Needs checking: no saved price, failed/stalled, or last checked 7+ days ago. Active checks are excluded."}{filter === "shopping" && " Tick Shopping list on an item to save it for your next trip."}{sort === "drop" && " Largest dollar decrease since the previous check first; missing comparisons last."}{sort === "oldest" && " Never-checked items first, then oldest saved check."}{sort === "target" && " Smallest absolute dollar difference from target first; missing prices or targets last."}</p>
        {error && <p role="alert" className="load-error">{error} <button className="secondary" onClick={() => void loadItems()}>Retry</button></p>}
        {archiveError && <p role="alert" className="load-error">{archiveError}</p>}
        {shoppingError && <p role="alert" className="load-error">{shoppingError}</p>}
        <div ref={watchlistRef} className="watch-table" role="region" aria-label={filter === "archived" ? "Archived items" : "Watchlist items"} tabIndex={0}>
          <div className="table-labels"><span>ITEM</span><span>RECENT TREND</span><span>CURRENT</span><span>CHANGE</span><span>TARGET</span><span>RECORDED RANGE</span></div>
          {filtered.map((item, index) => {
            const change = changeFor(item);
            const atTarget = targetReached(item);
            const range = recordedRange(item);
            const checkState = itemCheckState(item, checkStates[item.id]);
            const checkBusy = Boolean(checkStates[item.id]) && (checkState.status === "waiting" || checkState.status === "checking");
            return (
              <article className="item-row" key={item.id}>
                <div className="product-cell">
                  <div className={`product-thumb tone-${(index % 4) + 1}`}>
                    {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span>{item.name.charAt(0)}</span>}
                  </div>
                  <div className="product-info">
                    <h3><button className="history-item-name" aria-label={`View price history for ${item.name}`} onClick={() => setHistoryItemId(item.id)}>{item.name}</button></h3>
                    <p className="item-location">{item.clubName && item.clubId ? <>{"Tracking at"} <strong>{item.clubName}</strong> · Club {item.clubId}</> : "Location not recorded"}</p>
                    <p>{item.itemNumber ? `Item ${item.itemNumber} · ` : ""}{relativeTime(item.lastCheckedAt)}</p>
                    {item.archivedAt !== null ? <div className="item-check-status"><span className="status-badge archived">Archived</span><span className="status-message">Excluded from price checks.</span></div> : <div className="item-check-status" role="status"><span className={`status-badge ${checkState.status}`}>{checkState.status === "tested" ? "Tested · not saved" : checkState.status.charAt(0).toUpperCase() + checkState.status.slice(1)}</span><span className="status-message">{checkState.message}</span></div>}
                    {item.archivedAt === null ? <button className="check-price-link" onClick={() => openChecker(item.id)} disabled={checkBusy || !item.clubId}>{checkBusy ? checkState.status === "waiting" ? "Waiting…" : "Checking…" : checkState.status === "failed" ? "Retry price check" : item.currentPriceCents === null ? "Check price now" : "Check price"}</button> : <button className="check-price-link" disabled={archiving !== null} onClick={() => void changeArchive(item)}>{archiving === item.id ? "Restoring…" : "Restore"}</button>}
                    <button className="edit-item" aria-label={`Edit ${item.name}`} onClick={() => {
                      setEditItem(item);
                      setEditForm({ name: item.name, targetPrice: item.targetPriceCents === null ? "" : (item.targetPriceCents / 100).toFixed(2) });
                      setEditError(null);
                    }}>Edit</button>
                    {!item.clubId && <button className="edit-item" onClick={async () => { const club = window.prompt("Enter the recorded BJ’s club number for this item (from its purchase or Club Details page)."); if (!club) return; try { await itemsClient.location(item.id, club.trim().replace(/^0+/, "")); await loadItems(); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not set club."); } }}>Set club</button>}
                    <button className="edit-item" disabled={checkBusy} onClick={() => setMergeItem(item)}>Merge</button>
                    <button className="edit-item" aria-label={`View price history for ${item.name}`} onClick={() => setHistoryItemId(item.id)}>History</button>
                    {item.archivedAt === null ? <button className="edit-item" aria-label={`Archive ${item.name}`} disabled={archiving !== null || checkBusy} onClick={() => void changeArchive(item)}>{archiving === item.id ? "Archiving…" : "Archive"}</button> : <button className="remove-item" aria-label={`Permanently remove ${item.name}`} onClick={() => { setRemoveError(null); setRemoveCandidate(item); }}>Remove</button>}
                    {item.archivedAt === null && <label className="shopping-toggle"><input type="checkbox" checked={item.onShoppingList} disabled={shoppingBusy !== null} onChange={() => void changeShoppingList(item)} aria-label={`Include ${item.name} on shopping list`} />{shoppingBusy === item.id ? "Saving…" : "Shopping list"}</label>}
                  </div>
                </div>
                <SparkBars item={item} />
                <div className="current-price"><strong>{item.currentPriceCents === null && checkState?.status === "checking" ? "Checking…" : money(item.currentPriceCents)}</strong>{atTarget && <span>AT TARGET</span>}</div>
                <div className={`change ${change === null || change === 0 ? "flat" : change < 0 ? "down" : "up"}`}>
                  {change === null || change === 0 ? "—" : `${change < 0 ? "↓" : "↑"} ${money(Math.abs(change))}`}
                </div>
                <div className="target-price">{money(item.targetPriceCents)}</div>
                <div className="year-range">
                  <strong>{range ? `${money(range.low)}–${money(range.high)}` : "No checks yet"}</strong>
                  <span>{range ? `${range.checks} recorded check${range.checks === 1 ? "" : "s"}` : "Run a price check to start history"}</span>
                </div>
              </article>
            );
          })}
          {!filtered.length && <div className="empty-filter">{loading ? "Loading your watchlist…" : error ? "Your watchlist could not be loaded." : search ? "No items match your search or filter." : filter === "archived" ? "No archived items. Archive a product to hide it while keeping its history." : !activeItems.length ? "Your watchlist is empty. Add a product or restore one from Archived." : "No items match your search or filter."}</div>}
        </div>

        </div>
      </section>



      <footer><span>Club Price Watch · v{APP.version}</span><p>Independent personal tracker. Not affiliated with BJ’s Wholesale Club.</p><a href="https://www.bjs.com/" target="_blank" rel="noreferrer">Visit bjs.com ↗</a></footer>

      {mergeItem && <MergeItems source={mergeItem} items={items} busyIds={new Set(items.filter(item => { const state = itemCheckState(item, checkStates[item.id]); return Boolean(checkStates[item.id]) && (state.status === "waiting" || state.status === "checking"); }).map(item => item.id))} onClose={() => setMergeItem(null)} onMerged={async () => { await loadItems(); setNotice("Items merged. Full history combined and the old product link remembered."); }} />}
      {historyItem && <PriceHistory item={historyItem} onClose={() => setHistoryItemId(null)} />}

      {editItem && (
        <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !editSaving) setEditItem(null); }} onKeyDown={event => { if (event.key === "Escape" && !editSaving) setEditItem(null); }}>
          <section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="edit-title">
            <button className="modal-close" disabled={editSaving} onClick={() => setEditItem(null)} aria-label="Close">×</button>
            <h2 id="edit-title">Edit item</h2>
            <p className="modal-intro">Change the name or target price. Your recorded prices and history stay intact.</p>
            <form onSubmit={async event => {
              event.preventDefault();
              if (editSaving) return;
              setEditSaving(true);
              setEditError(null);
              try {
                await itemsClient.edit(editItem.id, { name: editForm.name, targetPrice: editForm.targetPrice.trim() === "" ? null : Number(editForm.targetPrice) });
                setEditItem(null);
                await loadItems();
                setNotice("Item updated.");
              } catch (error) { setEditError(error instanceof Error ? error.message : "Could not update this item. Try again."); }
              finally { setEditSaving(false); }
            }}>
              <label>Item name<input autoFocus required maxLength={300} disabled={editSaving} value={editForm.name} onChange={event => setEditForm({ ...editForm, name: event.target.value })} /></label>
              <label>Target price <span>optional</span><div className="money-input"><i>$</i><input type="number" min="0.01" step="0.01" disabled={editSaving} placeholder="Leave blank for no target" value={editForm.targetPrice} onChange={event => setEditForm({ ...editForm, targetPrice: event.target.value })} /></div></label>
              <p className="modal-intro">Leave the target blank to remove it.</p>
              {editError && <p className="form-message" role="alert">{editError}</p>}
              <div className="modal-actions"><button type="button" className="secondary" disabled={editSaving} onClick={() => setEditItem(null)}>Cancel</button><button className="primary" disabled={editSaving}>{editSaving ? "Saving…" : "Save changes"}</button></div>
            </form>
          </section>
        </div>
      )}

      {removeCandidate && (
        <div className="modal-backdrop">
          <section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="remove-title">
            <h2 id="remove-title">Remove this item?</h2>
            <p className="modal-intro">{removeCandidate.name} and its saved price history will be deleted.</p>
            {removeError && <p className="form-message" role="alert">{removeError}</p>}
            <div className="modal-actions">
              <button autoFocus className="secondary" disabled={!!removing} onClick={() => setRemoveCandidate(null)}>Keep item</button>
              <button className="primary" disabled={!!removing} onClick={async () => {
                setRemoving(removeCandidate.id);
                setRemoveError(null);
                try { await itemsClient.remove(removeCandidate.id); setRemoveCandidate(null); await loadItems(); setNotice("Item removed."); }
                catch (error) { setRemoveError(error instanceof Error ? error.message : "Could not remove item. Try again."); }
                finally { setRemoving(null); }
              }}>{removing ? "Removing…" : "Remove item"}</button>
            </div>
          </section>
        </div>
      )}

      {addOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && resetAdd()}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
            <button className="modal-close" onClick={resetAdd} aria-label="Close">×</button>
            <p className="modal-step">NEW PRICE WATCH</p>
            <h2 id="add-title">Track a BJ’s item</h2>
            <p className="modal-intro">Leave the starting price blank. With a recorded club number, saving starts a price check in your normal browser when the extension is connected. Unknown locations stay unchecked.</p>
            <form onSubmit={addItem}>
              <label>Recorded club number<input inputMode="numeric" pattern="[0-9]{1,6}" value={form.clubId} onChange={event => setForm({ ...form, clubId: event.target.value })} placeholder="Unknown until recorded" /></label>
              <label>BJ’s product link<input type="url" required pattern="https://(www\.)?bjs\.com/.*" title="Use a bjs.com product link" placeholder="https://www.bjs.com/product/..." value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} /></label>
              <button type="button" className="preview-button" onClick={() => void previewLink()} disabled={previewing}>{previewing ? "Reading link…" : "↗ Fill from product link"}</button>
              <label>Item name<input required placeholder="e.g. Fairlife milk, 52 fl. oz." value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <div className="field-pair">
                <label>Starting price <span>optional—leave blank to check</span><div className="money-input"><i>$</i><input type="number" min="0" step="0.01" placeholder="Leave blank" value={form.currentPrice} onChange={(event) => setForm({ ...form, currentPrice: event.target.value })} /></div></label>
                <label>Your target <span>optional</span><div className="money-input"><i>$</i><input type="number" min="0" step="0.01" placeholder="4.50" value={form.targetPrice} onChange={(event) => setForm({ ...form, targetPrice: event.target.value })} /></div></label>
              </div>
              {formMessage && <p className="form-message">{formMessage}</p>}
              <div className="modal-actions"><button type="button" className="secondary" onClick={resetAdd}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Start tracking →"}</button></div>
            </form>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
