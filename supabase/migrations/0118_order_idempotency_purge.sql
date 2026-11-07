-- Data retention (roadmap X-26): orders.idempotency_key only guards a
-- double-tapped order while it is being placed, so keep it for 24 hours and
-- then NULL it. place_order dedupes on (booth_id, idempotency_key) through a
-- partial unique index WHERE idempotency_key IS NOT NULL, so cleared keys
-- are fine.

-- The freeze trigger blocks ANY change to idempotency_key for every role,
-- including the purge below. Loosen it to allow exactly one transition:
-- non-NULL -> NULL while the transaction-local flag qkit.retention_purge is
-- on, which only the purge function sets. Changing the key to another value
-- stays blocked even with the flag on. Reproduces 0087's function verbatim
-- plus that one idempotency_key condition.
CREATE OR REPLACE FUNCTION qkit.orders_freeze_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = qkit
AS $$
BEGIN
  IF NEW.booth_id            IS DISTINCT FROM OLD.booth_id
    OR (OLD.order_number IS NOT NULL AND NEW.order_number IS DISTINCT FROM OLD.order_number)
    OR NEW.customer_name     IS DISTINCT FROM OLD.customer_name
    OR NEW.items             IS DISTINCT FROM OLD.items
    OR NEW.total_cents       IS DISTINCT FROM OLD.total_cents
    OR NEW.created_at        IS DISTINCT FROM OLD.created_at
    OR (
      NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      AND NOT (
        OLD.idempotency_key IS NOT NULL
        AND NEW.idempotency_key IS NULL
        AND coalesce(current_setting('qkit.retention_purge', true), '') = 'on'
      )
    )
    OR NEW.payment_method_kind IS DISTINCT FROM OLD.payment_method_kind
    OR NEW.access_token      IS DISTINCT FROM OLD.access_token
  THEN
    RAISE EXCEPTION 'ORDER_IMMUTABLE_COLUMN: financial/identity columns cannot be modified after creation';
  END IF;
  RETURN NEW;
END;
$$;

-- Returns the number of keys cleared. The flag is transaction-local so it
-- cannot leak into later statements on a pooled connection.
CREATE FUNCTION qkit.purge_order_idempotency_keys()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('qkit.retention_purge', 'on', true);
  UPDATE qkit.orders
     SET idempotency_key = NULL
   WHERE idempotency_key IS NOT NULL
     AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('qkit.retention_purge', 'off', true);
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION qkit.purge_order_idempotency_keys() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION qkit.purge_order_idempotency_keys() TO service_role;

-- Daily, through pg_cron. Best-effort like 0097 and 0108: a missing pg_cron
-- must not fail the migration. Check with: SELECT jobname, schedule FROM cron.job;
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    RAISE NOTICE 'pg_cron is not available: qkit.purge_order_idempotency_keys() is not scheduled';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'qkit-order-idempotency-purge',
    '27 3 * * *',
    'SELECT qkit.purge_order_idempotency_keys()'
  );
  RAISE NOTICE 'qkit.purge_order_idempotency_keys() scheduled daily';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'qkit.purge_order_idempotency_keys() was not scheduled: %', SQLERRM;
END
$do$;
