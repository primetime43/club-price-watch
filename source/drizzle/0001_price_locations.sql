-- Location is application data, never a schema default.
-- Existing records remain unknown until a location is recorded explicitly.
ALTER TABLE tracked_items ADD COLUMN club_id text;
--> statement-breakpoint
ALTER TABLE tracked_items ADD COLUMN club_name text;
--> statement-breakpoint
ALTER TABLE price_checks ADD COLUMN club_id text;
--> statement-breakpoint
ALTER TABLE price_checks ADD COLUMN club_name text;
