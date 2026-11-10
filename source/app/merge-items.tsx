"use client";
import { useEffect, useRef, useState } from "react";
import type { TrackedItem } from "../core/items.ts";
import { itemsClient } from "./hooks/use-watchlist.ts";

export default function MergeItems({ source, items, busyIds, onClose, onMerged }: {
  source: TrackedItem; items: TrackedItem[]; busyIds: Set<string>; onClose: () => void; onMerged: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [keepId, setKeepId] = useState(""); const [confirmed, setConfirmed] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { dialog.current?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, []);
  const options = items.filter(item => item.id !== source.id && item.clubId === source.clubId && !busyIds.has(item.id));
  const query = search.trim().toLocaleLowerCase();
  const matches = options.filter(item => [item.name, item.url, item.itemNumber ?? ""].some(value => value.toLocaleLowerCase().includes(query)));
  const keep = options.find(item => item.id === keepId);
  const blocked = busyIds.has(source.id) || !items.some(item => item.id === source.id);
  const product = (item: TrackedItem) => <p><strong>{item.name}</strong><br />{item.clubId ? `Club ${item.clubId}` : "Location not recorded"} · {item.currentPriceCents === null ? "No current price" : `$${(item.currentPriceCents / 100).toFixed(2)}`} · {item.archivedAt ? "Archived" : "Active"}<br /><a href={item.url} target="_blank" rel="noreferrer">{item.url}</a></p>;
  return <dialog ref={dialog} className="modal merge-dialog" aria-labelledby="merge-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <button className="modal-close" disabled={saving} onClick={onClose} aria-label="Close merge">×</button>
    <h2 id="merge-title">Merge duplicate items</h2>
    <p>Compare the product links, variety and size first. Similar names can be different products.</p>
    <h3>Item to combine</h3>{product(source)}
    <label className="merge-search">Find the item to keep<input autoFocus type="search" placeholder="Search name, product link or item number…" value={search} disabled={saving} onChange={event => { setSearch(event.target.value); setKeepId(""); setConfirmed(false); }} aria-controls="merge-candidates" /></label>
    <p role="status">{matches.length} of {options.length} eligible items{query ? " match your search" : " available"}.</p>
    <label>Keep this item<select id="merge-candidates" value={keepId} disabled={saving || !matches.length} onChange={event => { setKeepId(event.target.value); setConfirmed(false); }}>
      <option value="">Choose another item at the same club…</option>
      {matches.map(item => <option key={item.id} value={item.id}>{item.name}{item.archivedAt ? " (archived)" : ""}</option>)}
    </select></label>
    {keep && <><h3>Item to keep</h3>{product(keep)}
      <p>The selected item keeps its name, product link, current/previous prices, target and archive state. Both full histories are combined; identical purchase records appear once. Shopping list membership is kept if either item is selected.</p>
      <p>The other row is removed. Its product link will reuse the kept item on future imports. Download a backup first if you may need to undo this.</p>
      <label><input type="checkbox" checked={confirmed} disabled={saving} onChange={event => setConfirmed(event.target.checked)} /> I checked the links and confirm these are the same product.</label></>}
    {!options.length && <p>No eligible items at the same club. Finish any running checks first.</p>}
    {options.length > 0 && !matches.length && <p>No items match this search. Try another name or clear the search.</p>}
    {blocked && <p role="alert">Finish this item’s check and refresh before merging.</p>}
    {error && <p role="alert" className="form-message">{error}</p>}
    <div className="modal-actions"><button className="secondary" disabled={saving} onClick={onClose}>Cancel</button><button className="primary" disabled={saving || !confirmed || !keep || blocked} onClick={async () => {
      if (!keep || blocked || saving) return;
      setSaving(true); setError(null);
      try { await itemsClient.merge(source.id, keep.id); await onMerged(); onClose(); }
      catch (error) { setError(error instanceof Error ? error.message : "Could not merge items."); }
      finally { setSaving(false); }
    }}>{saving ? "Merging…" : "Merge into selected item"}</button></div>
  </dialog>;
}
