-- Admin-curated "Vendors on qkit" showcase for the public landing page.
-- showcase_on_landing is admin-only: authenticated's UPDATE on qkit.vendors is
-- an explicit column allowlist (0042 and later) and this column is deliberately
-- not added to it, so only the service role (the admin portal's toggle action)
-- can change it. The owner collects each vendor's permission offline; this
-- flag is the switch.
ALTER TABLE qkit.vendors
  ADD COLUMN showcase_on_landing boolean NOT NULL DEFAULT false;

-- Anonymous read of the showcase, limited to a display name and a logo URL.
-- The name is the shared Merqo profile display name (auth user_metadata),
-- falling back to the vendor's oldest booth. The logo is the profile picture
-- and only an https URL is passed on, so a crafted avatar value can never reach
-- the landing page as a script or data URL. No ids or emails leave the function.
-- display_name and avatar_url stay vendor-editable after an admin toggles the
-- vendor on, so the toggle is the only review step; the name is capped at 80
-- characters so an edit cannot publish an unbounded string.
CREATE OR REPLACE FUNCTION qkit.get_showcase_vendors()
RETURNS TABLE (name text, logo_url text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT left(s.name, 80) AS name, s.logo_url
  FROM (
    SELECT
      COALESCE(
        NULLIF(btrim(u.raw_user_meta_data->>'display_name'), ''),
        (
          SELECT NULLIF(btrim(b.name), '')
          FROM qkit.booths b
          WHERE b.vendor_id = v.id
          ORDER BY b.created_at, b.id
          LIMIT 1
        )
      ) AS name,
      CASE
        WHEN u.raw_user_meta_data->>'avatar_url' LIKE 'https://%'
          THEN u.raw_user_meta_data->>'avatar_url'
        ELSE NULL
      END AS logo_url
    FROM qkit.vendors v
    JOIN auth.users u ON u.id = v.id
    WHERE v.showcase_on_landing
  ) s
  WHERE s.name IS NOT NULL
  ORDER BY left(s.name, 80);
$$;

REVOKE EXECUTE ON FUNCTION qkit.get_showcase_vendors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.get_showcase_vendors() TO anon, authenticated;
