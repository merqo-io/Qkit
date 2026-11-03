-- Merqo owns subscriptions and pushes each vendor's entitlement to every kit.
-- This table is qkit's cache of that push. vendor_id references auth.users (not
-- qkit.vendors) so a push can land before the vendor row exists.
CREATE TABLE qkit.vendor_entitlements (
  vendor_id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                 TEXT        NOT NULL CHECK (tier IN ('free', 'starter', 'qkit')),
  founder              BOOLEAN     NOT NULL DEFAULT false,
  stats_window         TEXT        NOT NULL CHECK (stats_window IN ('24h', '90d')),
  event_pass_starts_at TIMESTAMPTZ,
  event_pass_ends_at   TIMESTAMPTZ,
  valid_until          TIMESTAMPTZ,
  issued_at            TIMESTAMPTZ NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vendor_entitlements_pass_window_check CHECK (
    (event_pass_starts_at IS NULL) = (event_pass_ends_at IS NULL)
    AND (event_pass_starts_at IS NULL OR event_pass_ends_at > event_pass_starts_at)
  )
);

ALTER TABLE qkit.vendor_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_entitlements_select" ON qkit.vendor_entitlements
  FOR SELECT TO authenticated
  USING (vendor_id = (SELECT auth.uid()) OR qkit.is_admin((SELECT auth.uid())));

-- Writes go through apply_vendor_entitlement under the service role only.
REVOKE ALL ON qkit.vendor_entitlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON qkit.vendor_entitlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON qkit.vendor_entitlements TO service_role;

-- Atomic last-writer-wins by issued_at: a stale or replayed push fails the
-- WHERE and changes nothing, so two racing pushes can never regress the cache.
-- Returns true when the row was written, false for a no-op.
CREATE FUNCTION qkit.apply_vendor_entitlement(
  p_vendor               UUID,
  p_tier                 TEXT,
  p_founder              BOOLEAN,
  p_stats_window         TEXT,
  p_event_pass_starts_at TIMESTAMPTZ,
  p_event_pass_ends_at   TIMESTAMPTZ,
  p_valid_until          TIMESTAMPTZ,
  p_issued_at            TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_written UUID;
BEGIN
  INSERT INTO qkit.vendor_entitlements AS e (
    vendor_id, tier, founder, stats_window,
    event_pass_starts_at, event_pass_ends_at, valid_until, issued_at, updated_at
  ) VALUES (
    p_vendor, p_tier, p_founder, p_stats_window,
    p_event_pass_starts_at, p_event_pass_ends_at, p_valid_until, p_issued_at, pg_catalog.now()
  )
  ON CONFLICT (vendor_id) DO UPDATE SET
    tier = EXCLUDED.tier,
    founder = EXCLUDED.founder,
    stats_window = EXCLUDED.stats_window,
    event_pass_starts_at = EXCLUDED.event_pass_starts_at,
    event_pass_ends_at = EXCLUDED.event_pass_ends_at,
    valid_until = EXCLUDED.valid_until,
    issued_at = EXCLUDED.issued_at,
    updated_at = pg_catalog.now()
  WHERE EXCLUDED.issued_at > e.issued_at
  RETURNING e.vendor_id INTO v_written;
  RETURN v_written IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION qkit.apply_vendor_entitlement(UUID, TEXT, BOOLEAN, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION qkit.apply_vendor_entitlement(UUID, TEXT, BOOLEAN, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;
