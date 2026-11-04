-- Cups a vendor sold across all their booths in a [p_from, p_to) window.
-- Merqo settles Event Pass top-ups from this count over HTTP, so it is callable
-- by the service role only. Same item-quantity sum as booth_cups_today.
CREATE OR REPLACE FUNCTION qkit.vendor_cups_between(
  p_vendor_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  SELECT COALESCE(SUM(GREATEST((item->>'quantity')::int, 0)), 0)::int
  FROM qkit.orders o
  JOIN qkit.booths b ON b.id = o.booth_id,
       jsonb_array_elements(o.items) AS item
  WHERE b.vendor_id = p_vendor_id
    AND o.status <> 'cancelled'
    AND o.payment_status <> 'pending'
    AND o.created_at >= p_from
    AND o.created_at < p_to;
$$;

REVOKE EXECUTE ON FUNCTION qkit.vendor_cups_between(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION qkit.vendor_cups_between(uuid, timestamptz, timestamptz)
  TO service_role;

COMMENT ON FUNCTION qkit.vendor_cups_between(uuid, timestamptz, timestamptz) IS
  'Event Pass settlement for merqo: cups a vendor sold across all booths in [p_from, p_to). Orders still awaiting payment are excluded because an unpaid cart is not a sale; cancelling frees the cups too.';
