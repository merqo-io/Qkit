-- A booth that runs a morning and an afternoon service wants its daily item
-- limit (booths.daily_cup_cap, 0094) to apply per service: 100 items for the
-- morning, then 100 again after lunch. The count used to reset only at
-- midnight SGT.
--
-- cap_reset_at is when the vendor last tapped "Start new service". The count
-- window now starts at whichever is later: the start of today in SGT, or
-- cap_reset_at. Midnight still resets the count on its own, so a vendor who
-- never taps the button sees exactly the 0094 behaviour, and a reset from
-- yesterday is ignored. NULL (every existing booth) means never reset.
ALTER TABLE qkit.booths
  ADD COLUMN IF NOT EXISTS cap_reset_at timestamptz;

COMMENT ON COLUMN qkit.booths.cap_reset_at IS
  'When the vendor last started a new service. The daily item limit counts '
  'orders from the later of this and the start of today in SGT. NULL means '
  'never reset. Set only through qkit.start_new_service, never a direct update.';

-- No column grant for authenticated: the only way to set the column is the
-- RPC below, which stamps now() itself. A direct update would let a caller
-- pick any time, including one in the future that hides every order.

-- Items already committed in the current service window. Same count as 0094;
-- only the window start changes. GREATEST skips a NULL cap_reset_at, so a
-- booth that was never reset counts from midnight as before.
CREATE OR REPLACE FUNCTION qkit.booth_cups_today(p_booth_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  SELECT COALESCE(SUM(GREATEST((item->>'quantity')::int, 0)), 0)::int
  FROM qkit.orders o,
       jsonb_array_elements(o.items) AS item
  WHERE o.booth_id = p_booth_id
    AND o.status <> 'cancelled'
    AND o.created_at >= GREATEST(
          date_trunc('day', now() AT TIME ZONE 'Asia/Singapore')
            AT TIME ZONE 'Asia/Singapore',
          (SELECT b.cap_reset_at FROM qkit.booths b WHERE b.id = p_booth_id)
        );
$$;

REVOKE EXECUTE ON FUNCTION qkit.booth_cups_today(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.booth_cups_today(uuid) TO anon, authenticated, service_role;

-- The trigger keeps its own inline count (see 0094 for why it cannot call the
-- STABLE booth_cups_today), so it gets the same window start. cap_reset_at is
-- read with the cap, before the lock: a reset that commits while this insert
-- waits can only make this one count stricter, never let it overshoot.
CREATE OR REPLACE FUNCTION qkit.enforce_daily_cup_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  v_cap int;
  v_reset_at timestamptz;
  v_used int;
  v_adding int;
BEGIN
  SELECT daily_cup_cap, cap_reset_at INTO v_cap, v_reset_at
  FROM qkit.booths WHERE id = NEW.booth_id;
  IF v_cap IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('qkit.cup_cap:' || NEW.booth_id::text));

  SELECT COALESCE(SUM(GREATEST((item->>'quantity')::int, 0)), 0)::int
  INTO v_adding
  FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) AS item;

  -- Counted inline rather than through qkit.booth_cups_today, which is STABLE
  -- and so would answer from the firing statement's snapshot: that snapshot
  -- predates the advisory lock, so an order that committed while this
  -- transaction waited for the lock would be invisible and the cap would be
  -- overshot by exactly the race the lock is there to prevent. This trigger
  -- function is VOLATILE, so its own query takes a fresh snapshot under
  -- READ COMMITTED.
  SELECT COALESCE(SUM(GREATEST((item->>'quantity')::int, 0)), 0)::int
  INTO v_used
  FROM qkit.orders o,
       jsonb_array_elements(o.items) AS item
  WHERE o.booth_id = NEW.booth_id
    AND o.status <> 'cancelled'
    AND o.created_at >= GREATEST(
          date_trunc('day', now() AT TIME ZONE 'Asia/Singapore')
            AT TIME ZONE 'Asia/Singapore',
          v_reset_at
        );

  IF v_used + v_adding > v_cap THEN
    RAISE EXCEPTION 'ORDER_CAP_REACHED: % of % cups served today, order asks for %',
      v_used, v_cap, v_adding;
  END IF;

  RETURN NEW;
END;
$$;

-- "Start new service": the item count for this booth goes back to zero now.
-- SECURITY DEFINER because authenticated has no UPDATE grant on the column;
-- the ownership check below stands in for the booths_vendor_update policy.
-- Returns false when the booth does not exist or is not the caller's, so a
-- non-owner learns nothing about another vendor's booth.
CREATE OR REPLACE FUNCTION qkit.start_new_service(p_booth_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  UPDATE qkit.booths
  SET cap_reset_at = now()
  WHERE id = p_booth_id
    AND vendor_id = auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION qkit.start_new_service(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION qkit.start_new_service(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION qkit.start_new_service(uuid) TO authenticated;
