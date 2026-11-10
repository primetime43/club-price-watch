-- Retain the retired purchase_location column so earlier data is never discarded.
-- New imports use the same club_id/club_name provenance as checked prices.
DROP INDEX idx_purchase_history_unique;
-- New rows always leave the legacy field null. Retain its discriminator only to
-- preserve distinct legacy rows during migration and backup/restore.
CREATE UNIQUE INDEX idx_purchase_history_unique ON price_checks(item_id, checked_at, price_cents, coalesce(club_id, ''), lower(trim(coalesce(purchase_location, '')))) WHERE source = 'purchase';
