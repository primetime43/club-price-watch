ALTER TABLE price_checks ADD COLUMN purchase_location TEXT;
DROP INDEX idx_purchase_history_unique;
CREATE UNIQUE INDEX idx_purchase_history_unique ON price_checks(item_id, checked_at, price_cents, lower(trim(coalesce(purchase_location, '')))) WHERE source = 'purchase';
