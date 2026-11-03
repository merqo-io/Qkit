-- Free-tier menu caps enforced in the database, mirroring validateMenuCaps in
-- src/app/dashboard/booths/actions.ts: at most 6 menu items per booth and 3
-- option groups per item. The app check only produces a friendly message; a
-- direct PostgREST write must not be able to bypass the cap.
-- menu_items is a JSONB array on qkit.booths, so the trigger is row-level.
CREATE FUNCTION qkit.enforce_menu_caps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  v_items JSONB := NEW.menu_items;
BEGIN
  IF pg_catalog.jsonb_typeof(v_items) <> 'array' THEN
    RETURN NEW;
  END IF;
  IF NOT qkit.vendor_has_free_caps(NEW.vendor_id) THEN
    RETURN NEW;
  END IF;

  IF pg_catalog.jsonb_array_length(v_items) > 6 THEN
    RAISE EXCEPTION 'free plan menu item limit exceeded'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_items) AS mi
    WHERE pg_catalog.jsonb_typeof(mi -> 'option_groups') = 'array'
      AND pg_catalog.jsonb_array_length(mi -> 'option_groups') > 3
  ) THEN
    RAISE EXCEPTION 'free plan option group limit exceeded'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER booths_enforce_menu_caps
  BEFORE INSERT OR UPDATE OF menu_items, vendor_id ON qkit.booths
  FOR EACH ROW EXECUTE FUNCTION qkit.enforce_menu_caps();

REVOKE ALL ON FUNCTION qkit.enforce_menu_caps()
  FROM PUBLIC, anon, authenticated, service_role;
