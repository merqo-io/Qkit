-- Self-checkout pickup becomes a per-booth switch. It was a vendor-wide
-- board_settings key (pickup_scan_enabled), so one vendor could not run a
-- pickup kiosk at one booth and staff pickup at another.
--
-- Backfill: every booth starts with its vendor's current board_settings
-- value. The board_settings key is left in place (no longer read by the app)
-- so rolling the app back still finds it.

ALTER TABLE qkit.booths
  ADD COLUMN pickup_scan_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN qkit.booths.pickup_scan_enabled IS
  'Self-checkout pickup: a ready order''s status page shows a QR the customer '
  'scans at this booth''s pickup kiosk. Replaces the vendor-wide '
  'board_settings.pickup_scan_enabled key.';

UPDATE qkit.booths b
SET pickup_scan_enabled = true
FROM qkit.vendors v
WHERE b.vendor_id = v.id
  AND v.board_settings -> 'pickup_scan_enabled' = 'true'::jsonb;

-- booths has column-level INSERT/UPDATE grants (0091, 0095); a new column is
-- not covered by them until it is named.
GRANT INSERT (pickup_scan_enabled), UPDATE (pickup_scan_enabled)
  ON qkit.booths TO authenticated;
