-- Seed the cache from the local billing state this release retires.
-- vendors.plan = 'pro' becomes the qkit tier as a founder (a null valid_until
-- means open until merqo's next push). The latest unexpired license becomes the
-- Event Pass window. issued_at is the epoch, so any real merqo push supersedes
-- the seed, even one issued before this migration ran.
INSERT INTO qkit.vendor_entitlements (
  vendor_id, tier, founder, stats_window,
  event_pass_starts_at, event_pass_ends_at, valid_until, issued_at
)
SELECT
  v.id,
  CASE WHEN v.plan = 'pro' THEN 'qkit' ELSE 'free' END,
  v.plan = 'pro',
  CASE WHEN v.plan = 'pro' THEN '90d' ELSE '24h' END,
  l.valid_from,
  l.expires_at,
  NULL,
  '1970-01-01T00:00:00Z'::timestamptz
FROM qkit.vendors v
LEFT JOIN LATERAL (
  SELECT valid_from, expires_at
  FROM qkit.licenses
  WHERE vendor_id = v.id AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1
) l ON true
WHERE v.plan = 'pro' OR l.expires_at IS NOT NULL
ON CONFLICT (vendor_id) DO NOTHING;
