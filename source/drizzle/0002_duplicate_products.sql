-- Derive identity from the final product URL segment, ignoring query/hash/trailing slash.
-- No location values are schema defaults. Existing rows and histories are untouched.
ALTER TABLE tracked_items ADD COLUMN product_id text GENERATED ALWAYS AS (
  substr(
    rtrim(substr(url, 1, min(instr(url || '?', '?'), instr(url || '#', '#')) - 1), '/'),
    length(rtrim(
      rtrim(substr(url, 1, min(instr(url || '?', '?'), instr(url || '#', '#')) - 1), '/'),
      replace(rtrim(substr(url, 1, min(instr(url || '?', '?'), instr(url || '#', '#')) - 1), '/'), '/', '')
    )) + 1
  )
) VIRTUAL;
--> statement-breakpoint
CREATE INDEX idx_tracked_items_product ON tracked_items(product_id);
--> statement-breakpoint
CREATE TRIGGER prevent_duplicate_product_insert BEFORE INSERT ON tracked_items
WHEN EXISTS (
  SELECT 1 FROM tracked_items
  WHERE product_id = NEW.product_id
    AND (club_id = NEW.club_id OR club_id IS NULL OR NEW.club_id IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'cpw_duplicate_product');
END;
--> statement-breakpoint
CREATE TRIGGER prevent_duplicate_product_update AFTER UPDATE OF url, club_id ON tracked_items
WHEN (OLD.url IS NOT NEW.url OR OLD.club_id IS NOT NEW.club_id)
  AND EXISTS (
    SELECT 1 FROM tracked_items
    WHERE id <> NEW.id AND product_id = NEW.product_id
      AND (club_id = NEW.club_id OR club_id IS NULL OR NEW.club_id IS NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'cpw_duplicate_product');
END;
