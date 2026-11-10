ALTER TABLE tracked_items ADD COLUMN on_shopping_list INTEGER NOT NULL DEFAULT 0 CHECK (on_shopping_list IN (0, 1));
