-- A booth's daily item limit (booths.daily_cup_cap, 0094) counted every item
-- sold. A special item with its own sold-out limit (menu_items[].stock) may or
-- may not belong in that total, so the vendor now chooses per item.
--
-- The choice lives on the menu item as the optional boolean
-- excludeFromBoothLimit. true means the item does not use up the booth's daily
-- limit; an absent key or false means it does, so every existing booth behaves
-- exactly as before with no backfill. The key rides through
-- get_booth_for_order untouched (it strips only cost fields), so the order page
-- can read it. It is not sensitive.
--
-- The flag is read from the booth's CURRENT menu, not stored on the order line:
-- editing it applies to the whole service window at once, which is what the
-- vendor sees on the board. max_items_per_order (0096) is a different limit and
-- keeps counting every item.

-- Ids of menu items that opt out of the booth limit. Only a JSON true counts as
-- opting out, so a malformed value can never silently stop an item counting.
CREATE OR REPLACE FUNCTION qkit.booth_limit_excluded_ids(p_menu jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = qkit
AS $$
  SELECT COALESCE(array_agg(mi->>'id'), '{}'::text[])
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(p_menu) = 'array' THEN p_menu ELSE '[]'::jsonb END
       ) AS mi
  WHERE jsonb_typeof(mi) = 'object'
    AND mi->'excludeFromBoothLimit' = 'true'::jsonb;
$$;

REVOKE EXECUTE ON FUNCTION qkit.booth_limit_excluded_ids(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.booth_limit_excluded_ids(jsonb) TO anon, authenticated, service_role;

-- Items committed in the current service window, minus excluded items. The
-- window is unchanged from 0106.
CREATE OR REPLACE FUNCTION qkit.booth_cups_today(p_booth_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  SELECT COALESCE(SUM(GREATEST((item->>'quantity')::int, 0)), 0)::int
  FROM qkit.orders o,
       jsonb_array_elements(o.items) AS item
  WHERE o.booth_id = p_booth_id
    AND o.status <> 'cancelled'
    AND o.created_at >= GREATEST(
          date_trunc('day', now() AT TIME ZONE 'Asia/Singapore')
            AT TIME ZONE 'Asia/Singapore',
          (SELECT b.cap_reset_at FROM qkit.booths b WHERE b.id = p_booth_id)
        )
    AND NOT COALESCE(
          item->>'menuItemId' = ANY (
            qkit.booth_limit_excluded_ids(
              (SELECT b.menu_items FROM qkit.booths b WHERE b.id = p_booth_id))),
          false);
$$;

REVOKE EXECUTE ON FUNCTION qkit.booth_cups_today(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.booth_cups_today(uuid) TO anon, authenticated, service_role;

-- Same lock and fresh-snapshot logic as 0106 (see 0094 for why the count is
-- inline); only the lines that count are filtered, on both the committed total
-- and the incoming order.
CREATE OR REPLACE FUNCTION qkit.enforce_daily_cup_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  v_cap int;
  v_reset_at timestamptz;
  v_excluded text[];
  v_used int;
  v_adding int;
BEGIN
  SELECT daily_cup_cap, cap_reset_at, qkit.booth_limit_excluded_ids(menu_items)
  INTO v_cap, v_reset_at, v_excluded
  FROM qkit.booths WHERE id = NEW.booth_id;
  IF v_cap IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('qkit.cup_cap:' || NEW.booth_id::text));

  SELECT COALESCE(SUM(GREATEST((item->>'quantity')::int, 0)), 0)::int
  INTO v_adding
  FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) AS item
  WHERE NOT COALESCE(item->>'menuItemId' = ANY (v_excluded), false);

  -- Counted inline rather than through qkit.booth_cups_today, which is STABLE
  -- and so would answer from the firing statement's snapshot: that snapshot
  -- predates the advisory lock, so an order that committed while this
  -- transaction waited for the lock would be invisible and the cap would be
  -- overshot by exactly the race the lock is there to prevent. This trigger
  -- function is VOLATILE, so its own query takes a fresh snapshot under
  -- READ COMMITTED.
  SELECT COALESCE(SUM(GREATEST((item->>'quantity')::int, 0)), 0)::int
  INTO v_used
  FROM qkit.orders o,
       jsonb_array_elements(o.items) AS item
  WHERE o.booth_id = NEW.booth_id
    AND o.status <> 'cancelled'
    AND o.created_at >= GREATEST(
          date_trunc('day', now() AT TIME ZONE 'Asia/Singapore')
            AT TIME ZONE 'Asia/Singapore',
          v_reset_at
        )
    AND NOT COALESCE(item->>'menuItemId' = ANY (v_excluded), false);

  IF v_used + v_adding > v_cap THEN
    RAISE EXCEPTION 'ORDER_CAP_REACHED: % of % cups served today, order asks for %',
      v_used, v_cap, v_adding;
  END IF;

  RETURN NEW;
END;
$$;

-- Other baskets' holds count against the booth total only for items that count.
-- The per-item map stays complete: an excluded item can still have its own
-- sold-out limit.
CREATE OR REPLACE FUNCTION qkit.booth_availability(p_booth_id uuid, p_session uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
DECLARE
  v_max int;
  v_excluded text[];
  v_stock jsonb;
  v_cups_left int;
  v_others jsonb;
  v_others_total int;
  v_remaining jsonb := '{}'::jsonb;
  v_held jsonb := '{}'::jsonb;
  v_left int;
  r record;
  v_other int;
BEGIN
  SELECT max_items_per_order, qkit.booth_limit_excluded_ids(menu_items)
  INTO v_max, v_excluded
  FROM qkit.booths WHERE id = p_booth_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_stock := qkit.booth_remaining_stock(p_booth_id);
  v_cups_left := qkit.booth_cups_left(p_booth_id);

  SELECT COALESCE(jsonb_object_agg(s.k, s.q), '{}'::jsonb),
         COALESCE(SUM(s.q) FILTER (WHERE NOT (s.k = ANY (v_excluded))), 0)::int
  INTO v_others, v_others_total
  FROM (
    SELECT e.key AS k, SUM(e.value::int)::int AS q
    FROM qkit.cart_holds h, jsonb_each_text(h.items) AS e
    WHERE h.booth_id = p_booth_id
      AND h.expires_at > now()
      AND (p_session IS NULL OR h.session_id <> p_session)
    GROUP BY e.key
  ) AS s;

  FOR r IN SELECT key AS id, value::int AS stock FROM jsonb_each_text(v_stock) LOOP
    v_other := LEAST(COALESCE((v_others->>r.id)::int, 0), r.stock);
    v_remaining := v_remaining || jsonb_build_object(r.id, r.stock - v_other);
    IF v_other > 0 THEN
      v_held := v_held || jsonb_build_object(r.id, v_other);
    END IF;
  END LOOP;

  IF v_cups_left IS NOT NULL THEN
    v_left := GREATEST(v_cups_left - v_others_total, 0);
  END IF;

  RETURN jsonb_build_object(
    'remaining',     v_remaining,
    'held',          v_held,
    'left',          v_left,
    'left_held',     COALESCE(v_cups_left - v_left, 0),
    'max_per_order', v_max
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION qkit.booth_availability(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.booth_availability(uuid, uuid) TO anon, authenticated, service_role;

-- The grant against the booth total (`left`) only consumes budget for items
-- that count; the per-order limit still bounds the whole basket. Everything
-- else is as in 0111.
CREATE OR REPLACE FUNCTION qkit.hold_cart(p_booth_id uuid, p_session uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  b qkit.booths;
  v_avail jsonb;
  v_budget int;
  v_counted_left int;
  v_counted int := 0;
  v_excluded text[];
  v_grant jsonb := '{}'::jsonb;
  v_total int := 0;
  v_take int;
  r record;
BEGIN
  SELECT * INTO b FROM qkit.booths WHERE id = p_booth_id;
  IF NOT FOUND OR p_session IS NULL THEN
    RETURN NULL;
  END IF;

  IF b.daily_cup_cap IS NULL
     AND qkit.booth_remaining_stock(b.id) = '{}'::jsonb THEN
    RETURN qkit.booth_availability(b.id, p_session);
  END IF;

  IF NOT qkit.check_rate_limit('hold:booth:' || b.id::text, 180, 60) THEN
    RETURN qkit.booth_availability(b.id, p_session);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('qkit.cart_hold:' || b.id::text));

  DELETE FROM qkit.cart_holds WHERE booth_id = b.id AND expires_at <= now();

  v_avail := qkit.booth_availability(b.id, p_session);
  v_excluded := qkit.booth_limit_excluded_ids(b.menu_items);
  v_budget := LEAST(COALESCE(b.max_items_per_order, 50), 50);
  v_counted_left := (v_avail->>'left')::int;

  IF jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) <= 50 THEN
    -- Pooled per menu item, like the stock counter. A line that is not a
    -- whole-number quantity of an item on this booth's menu is ignored
    -- rather than raised on: a hold is advisory, and a malformed basket
    -- should cost the caller their hold, not an error page.
    FOR r IN
      SELECT it->>'menuItemId' AS id,
             SUM(LEAST(GREATEST((it->>'quantity')::numeric, 0), 50))::int AS want
      FROM jsonb_array_elements(p_items) AS it
      WHERE jsonb_typeof(it) = 'object'
        AND jsonb_typeof(it->'quantity') = 'number'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(b.menu_items) AS mi
          WHERE mi->>'id' = it->>'menuItemId'
        )
      GROUP BY it->>'menuItemId'
      ORDER BY it->>'menuItemId'
    LOOP
      v_take := LEAST(r.want, v_budget - v_total);
      IF v_counted_left IS NOT NULL AND NOT (r.id = ANY (v_excluded)) THEN
        v_take := LEAST(v_take, v_counted_left - v_counted);
      END IF;
      IF v_avail->'remaining' ? r.id THEN
        v_take := LEAST(v_take, (v_avail->'remaining'->>r.id)::int);
      END IF;
      IF v_take > 0 THEN
        v_grant := v_grant || jsonb_build_object(r.id, v_take);
        v_total := v_total + v_take;
        IF NOT (r.id = ANY (v_excluded)) THEN
          v_counted := v_counted + v_take;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF v_total = 0 THEN
    DELETE FROM qkit.cart_holds WHERE booth_id = b.id AND session_id = p_session;
  ELSE
    INSERT INTO qkit.cart_holds (booth_id, session_id, items, qty, expires_at)
    VALUES (b.id, p_session, v_grant, v_total, now() + interval '5 minutes')
    ON CONFLICT (booth_id, session_id)
    DO UPDATE SET items = EXCLUDED.items,
                  qty = EXCLUDED.qty,
                  expires_at = EXCLUDED.expires_at;
  END IF;

  RETURN v_avail;
END;
$$;

REVOKE EXECUTE ON FUNCTION qkit.hold_cart(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.hold_cart(uuid, uuid, jsonb) TO anon, authenticated, service_role;
