-- Data retention (roadmap X-26): a payment screenshot is deleted when the
-- order it proves is deleted, and only then. Postgres cannot remove Storage
-- objects, so deleting an order queues its object path here and the app
-- drains the queue through the Storage API with the service role.

CREATE TABLE IF NOT EXISTS qkit.proof_storage_deletions (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  path text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);

ALTER TABLE qkit.proof_storage_deletions ENABLE ROW LEVEL SECURITY;

-- No policies: only the service role, which bypasses RLS, reads or writes it.
REVOKE ALL ON TABLE qkit.proof_storage_deletions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE qkit.proof_storage_deletions_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE qkit.proof_storage_deletions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE qkit.proof_storage_deletions_id_seq TO service_role;

-- Row triggers fire for cascade deletes too (booth delete, vendor delete,
-- auth user delete), which is how most orders disappear.
CREATE OR REPLACE FUNCTION qkit.queue_proof_storage_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.payment_proof_path IS NOT NULL THEN
    INSERT INTO qkit.proof_storage_deletions (bucket, path)
    VALUES ('payment-proofs', OLD.payment_proof_path);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION qkit.queue_proof_storage_deletion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_queue_proof_storage_deletion ON qkit.orders;
CREATE TRIGGER orders_queue_proof_storage_deletion
  AFTER DELETE ON qkit.orders
  FOR EACH ROW
  EXECUTE FUNCTION qkit.queue_proof_storage_deletion();
