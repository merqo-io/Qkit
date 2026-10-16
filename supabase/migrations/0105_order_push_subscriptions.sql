-- Web push subscriptions for the "your order is ready" alert. A locked phone
-- suspends the status page, so its poll and local notification never fire;
-- a push reaches the service worker instead. See
-- docs/superpowers/specs/2026-10-16-order-ready-web-push-design.md.
--
-- Service-role only: RLS on with no policies, and no grant to anon or
-- authenticated. The customer saves a subscription through a token-checked
-- server action; advanceOrder's ready transition reads it through the
-- service-role client. title/body/url/tag are computed server-side when the
-- customer subscribes, so the sender never needs the order's access token.
CREATE TABLE qkit.order_push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES qkit.orders(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL CHECK (char_length(endpoint) <= 1024),
  p256dh     TEXT NOT NULL CHECK (char_length(p256dh) <= 256),
  auth       TEXT NOT NULL CHECK (char_length(auth) <= 64),
  title      TEXT NOT NULL CHECK (char_length(title) <= 200),
  body       TEXT NOT NULL CHECK (char_length(body) <= 300),
  url        TEXT NOT NULL CHECK (char_length(url) <= 500),
  tag        TEXT NOT NULL CHECK (char_length(tag) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, endpoint)
);

ALTER TABLE qkit.order_push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON qkit.order_push_subscriptions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON qkit.order_push_subscriptions
  TO service_role;

-- A finished order needs no ready alert. Deleting here covers every path to
-- completed/cancelled (vendor taps, the auto-clear sweep, the SQL stale-order
-- sweep). SECURITY DEFINER because the updating vendor has no privilege on
-- this table.
CREATE FUNCTION qkit.drop_finished_order_push_subscriptions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM qkit.order_push_subscriptions WHERE order_id = NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION qkit.drop_finished_order_push_subscriptions()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER orders_drop_finished_push_subscriptions
  AFTER UPDATE OF status ON qkit.orders
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'cancelled')
        AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION qkit.drop_finished_order_push_subscriptions();
