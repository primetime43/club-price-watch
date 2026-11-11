"use client";
import { useState } from "react";
import { BACKUP_MAX_BYTES, parseBackupFile } from "../core/backup.ts";
import type { WatchlistBackup, RestoreMode } from "../core/backup.ts";

export default function BackupControls({ onRestored }: { onRestored: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<WatchlistBackup | null>(null);
  const [mode, setMode] = useState<RestoreMode>("missing");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => { if (!busy) setOpen(false); };
  async function exportFile() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/backup", { cache: "no-store" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Could not export the backup."); }
      const contents = await response.text();
      parseBackupFile(contents);
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `club-price-watch-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("Backup download started. Keep the file outside the app folder, such as Documents or a backup drive.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not export the backup."); }
    finally { setBusy(false); }
  }
  async function restoreFile() {
    if (!backup || busy || (mode === "replace" && !confirmed)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ backup, mode, confirmReplace: confirmed }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not restore this backup.");
      await onRestored();
      setBackup(null); setConfirmed(false); setMode("missing");
      setMessage(`Restored ${data.imported} product(s) and ${data.historyPoints} price check(s). ${data.skipped} existing product(s) left unchanged.`);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not restore this backup."); }
    finally { setBusy(false); }
  }
  return <>
    <button className="secondary check-prices" onClick={() => { setOpen(true); setError(null); setMessage(null); }}>Backup &amp; restore</button>
    {open && <div className="modal-backdrop backup-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }} onKeyDown={event => { if (event.key === "Escape") close(); }}>
      <section className="modal backup-modal" role="dialog" aria-modal="true" aria-labelledby="backup-title">
        <button className="modal-close" disabled={busy} onClick={close} aria-label="Close">×</button>
        <h2 id="backup-title">Backup &amp; restore</h2>
        <p className="modal-intro">Save your active and archived products, targets, prices and full recorded history to a file. Finish any running price checks before exporting or restoring.</p>
        <button autoFocus className="primary" disabled={busy} onClick={() => void exportFile()}>Download backup</button>
        <div className="restore-section">
          <h3>Restore from a file</h3>
          <p>Choose a Club Price Watch JSON backup (up to 20 MB). You can review it before restoring.</p>
          <label className="backup-file">Backup file<input type="file" accept=".json,application/json" disabled={busy} onChange={async event => {
            const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
            if (!file) return;
            setBackup(null); setConfirmed(false); setError(null); setMessage(null); setBusy(true);
            try { if (file.size > BACKUP_MAX_BYTES) throw new Error("Backup files must be 20 MB or smaller."); setBackup(parseBackupFile(await file.text())); }
            catch (error) { setError(error instanceof Error ? error.message : "Could not read this backup."); }
            finally { setBusy(false); }
          }} /></label>
          {backup && <>
            <p className="backup-preview" role="status"><strong>{backup.items.length} product(s) · {backup.items.reduce((count, item) => count + item.history.length, 0)} price check(s)</strong><br />Exported {new Date(backup.exportedAt).toLocaleString()}</p>
            <fieldset disabled={busy} className="restore-modes"><legend>How should this file be restored?</legend>
              <label><input type="radio" name="restore-mode" checked={mode === "missing"} onChange={() => { setMode("missing"); setConfirmed(false); }} /><span><strong>Add missing products</strong><br />Keep existing products and their history unchanged.</span></label>
              <label><input type="radio" name="restore-mode" checked={mode === "replace"} onChange={() => { setMode("replace"); setConfirmed(false); }} /><span><strong>Replace the watchlist</strong><br />Use only the products and history in this file.</span></label>
              {mode === "replace" && <label className="replace-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I understand this replaces all current products and their history. I have saved any backup I need.</span></label>}
            </fieldset>
            <button className="primary" disabled={busy || (mode === "replace" && !confirmed)} onClick={() => void restoreFile()}>{busy ? "Restoring…" : mode === "replace" ? "Replace from backup" : "Restore missing products"}</button>
          </>}
        </div>
        {error && <p className="form-message" role="alert">{error}</p>}
        {message && <p className="form-message" role="status">{message}</p>}
      </section>
    </div>}
  </>;
}
