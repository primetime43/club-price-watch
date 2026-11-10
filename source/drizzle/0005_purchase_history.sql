ALTER TABLE price_checks ADD COLUMN source TEXT CHECK (source IS NULL OR source = 'purchase');
CREATE UNIQUE INDEX idx_purchase_history_unique ON price_checks(item_id, checked_at, price_cents) WHERE source = 'purchase';
