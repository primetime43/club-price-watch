CREATE TABLE item_aliases (
  id TEXT PRIMARY KEY NOT NULL,
  item_id TEXT NOT NULL REFERENCES tracked_items(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  url TEXT NOT NULL,
  club_id TEXT,
  club_name TEXT,
  replaces_id TEXT
);
CREATE INDEX idx_item_aliases_item ON item_aliases(item_id);
CREATE UNIQUE INDEX idx_item_aliases_identity ON item_aliases(product_id, coalesce(club_id, ''));
CREATE TRIGGER prevent_conflicting_alias_insert BEFORE INSERT ON item_aliases
WHEN EXISTS (SELECT 1 FROM tracked_items WHERE product_id = NEW.product_id
  AND id <> NEW.item_id AND id IS NOT NEW.replaces_id
  AND (club_id = NEW.club_id OR club_id IS NULL OR NEW.club_id IS NULL))
  OR EXISTS (SELECT 1 FROM item_aliases WHERE product_id = NEW.product_id
  AND (club_id = NEW.club_id OR club_id IS NULL OR NEW.club_id IS NULL))
BEGIN SELECT RAISE(ABORT, 'cpw_duplicate_product'); END;
CREATE TRIGGER prevent_aliased_product_insert BEFORE INSERT ON tracked_items
WHEN EXISTS (SELECT 1 FROM item_aliases WHERE product_id = NEW.product_id
  AND (club_id = NEW.club_id OR club_id IS NULL OR NEW.club_id IS NULL))
BEGIN SELECT RAISE(ABORT, 'cpw_duplicate_product'); END;
CREATE TRIGGER prevent_aliased_product_update AFTER UPDATE OF url, club_id ON tracked_items
WHEN (OLD.url IS NOT NEW.url OR OLD.club_id IS NOT NEW.club_id)
  AND EXISTS (SELECT 1 FROM item_aliases WHERE item_id <> NEW.id AND product_id = NEW.product_id
    AND (club_id = NEW.club_id OR club_id IS NULL OR NEW.club_id IS NULL))
BEGIN SELECT RAISE(ABORT, 'cpw_duplicate_product'); END;
