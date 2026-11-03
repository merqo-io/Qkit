-- With the daily order-number reset on, an order's display number ranks from
-- the first order of its window. booths.cap_reset_at keeps only the LATEST
-- "Start new service", so after a second restart in one day the orders of the
-- earlier service could not be told apart from midnight's and their numbers
-- shifted. This log keeps every restart so each order ranks from the latest
-- restart at or before it.
--
-- Written only by qkit.start_new_service, below; vendors can read the rows of
-- their own booths. The app falls back to cap_reset_at while this is missing.
CREATE TABLE IF NOT EXISTS qkit.booth_service_starts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booth_id   UUID NOT NULL REFERENCES qkit.booths(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booth_service_starts_booth_started_idx
  ON qkit.booth_service_starts (booth_id, started_at);

ALTER TABLE qkit.booth_service_starts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON qkit.booth_service_starts FROM anon, authenticated;
GRANT SELECT ON qkit.booth_service_starts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON qkit.booth_service_starts TO service_role;

DROP POLICY IF EXISTS booth_service_starts_vendor_select
  ON qkit.booth_service_starts;
CREATE POLICY booth_service_starts_vendor_select
  ON qkit.booth_service_starts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM qkit.booths b
      WHERE b.id = booth_service_starts.booth_id
        AND b.vendor_id = auth.uid()
    )
  );

-- Restarts already stamped by 0106 keep their latest time.
INSERT INTO qkit.booth_service_starts (booth_id, started_at)
SELECT b.id, b.cap_reset_at
FROM qkit.booths b
WHERE b.cap_reset_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM qkit.booth_service_starts s
    WHERE s.booth_id = b.id AND s.started_at = b.cap_reset_at
  );

-- Same signature and result as 0106; also logs the restart with the very
-- now() it stamps on cap_reset_at (one transaction, one timestamp).
CREATE OR REPLACE FUNCTION qkit.start_new_service(p_booth_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  n integer;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  UPDATE qkit.booths
  SET cap_reset_at = v_now
  WHERE id = p_booth_id
    AND vendor_id = auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RETURN false;
  END IF;

  INSERT INTO qkit.booth_service_starts (booth_id, started_at)
  VALUES (p_booth_id, v_now);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION qkit.start_new_service(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION qkit.start_new_service(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION qkit.start_new_service(uuid) TO authenticated;
