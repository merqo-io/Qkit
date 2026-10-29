-- Failure log Merqo reads through GET /api/merqo/vendor-activity: rejected
-- paykit callbacks and order-board actions that failed with a generic error.
-- No PII: ref is an internal id (order uuid), code a short machine code.
-- Kinds are the subset of @merqo/ui/contracts INCIDENT_KINDS that qkit writes.
--
-- Service-role only: RLS on with no policies, no anon/authenticated grant.
CREATE TABLE qkit.ops_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vendor_id  UUID NOT NULL REFERENCES qkit.vendors(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('webhook_rejected', 'action_error')),
  ref        TEXT NOT NULL CHECK (char_length(ref) <= 64),
  code       TEXT NOT NULL CHECK (char_length(code) <= 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ops_events_vendor_created_idx
  ON qkit.ops_events (vendor_id, created_at DESC);

ALTER TABLE qkit.ops_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON qkit.ops_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON qkit.ops_events TO service_role;

-- 30-day retention.
CREATE FUNCTION qkit.purge_ops_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM qkit.ops_events WHERE created_at < now() - interval '30 days';
END;
$$;

REVOKE EXECUTE ON FUNCTION qkit.purge_ops_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION qkit.purge_ops_events() TO service_role;

-- Daily, through pg_cron. Best-effort like 0097: a missing pg_cron must not
-- fail the migration. Check with: SELECT jobname, schedule FROM cron.job;
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    RAISE NOTICE 'pg_cron is not available: qkit.purge_ops_events() is not scheduled';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'qkit-ops-events-purge',
    '17 3 * * *',
    'SELECT qkit.purge_ops_events()'
  );
  RAISE NOTICE 'qkit.purge_ops_events() scheduled daily';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'qkit.purge_ops_events() was not scheduled: %', SQLERRM;
END
$do$;
