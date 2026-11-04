-- One SQL home for entitlement semantics; src/lib/plan.ts mirrors it.
--   effective tier: the stored tier while valid_until is null or in the future,
--                   otherwise free (merqo has no cron to push the lapse).
--   pass running:   event_pass_starts_at <= now() < event_pass_ends_at.
--   entitled:       qkit-tier capability, i.e. effective tier qkit or a running pass.

CREATE FUNCTION qkit.vendor_effective_tier(p_vendor UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT e.tier FROM qkit.vendor_entitlements e
      WHERE e.vendor_id = p_vendor
        AND (e.valid_until IS NULL OR e.valid_until > pg_catalog.now())),
    'free'
  );
$$;

CREATE FUNCTION qkit.vendor_pass_running(p_vendor UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM qkit.vendor_entitlements e
    WHERE e.vendor_id = p_vendor
      AND e.event_pass_starts_at <= pg_catalog.now()
      AND pg_catalog.now() < e.event_pass_ends_at
  );
$$;

-- Same name and signature as 0038: booth_servable, can_create_booth and the
-- 0101 creation-cap trigger all resolve through it, so they follow the cache
-- without being redefined.
CREATE OR REPLACE FUNCTION qkit.vendor_entitled(p_vendor UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT qkit.vendor_effective_tier(p_vendor) = 'qkit'
      OR qkit.vendor_pass_running(p_vendor);
$$;

-- Item and option-group caps bind only the free tier with no running pass.
CREATE FUNCTION qkit.vendor_has_free_caps(p_vendor UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT qkit.vendor_effective_tier(p_vendor) = 'free'
     AND NOT qkit.vendor_pass_running(p_vendor);
$$;

REVOKE ALL ON FUNCTION qkit.vendor_effective_tier(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION qkit.vendor_pass_running(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION qkit.vendor_has_free_caps(UUID) FROM PUBLIC, anon, authenticated;
