-- CCSP audit slice C2: tighten two anonymous-write limits.
--
-- 1. hold_cart: the per-booth flood bucket drops from 600 to 180 calls a minute.
--    The per-IP guard lives in the server action, which a direct RPC call skips,
--    so this booth bucket is the only bound on that path.
-- 2. place_order: a payment-first booth refuses a new order (ORDER_BUSY) once 30
--    orders are awaiting payment inside the 30 minute abandonment window
--    (ABANDONED_PAYMENT_MS in src/lib/orders.ts). Pending orders hold stock, so
--    an unbounded stream of them could starve a booth. The idempotent replay
--    still returns before the check. Otherwise identical to 0095.
--
-- Applied by the owner by hand: staging first, then production. The app maps
-- ORDER_BUSY to a friendly message, so deploy order does not matter.

CREATE OR REPLACE FUNCTION qkit.place_order(
  p_short_code      text,
  p_customer_name   text,
  p_items           jsonb,
  p_idempotency_key uuid,
  p_customer_phone  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = qkit
AS $$
DECLARE
  b qkit.booths;
  v_existing_number text;
  v_existing_token uuid;
  v_seq int;
  v_number text;
  v_token uuid;
  v_total int := 0;
  v_priced jsonb := '[]'::jsonb;
  v_expects_payment boolean;
  v_payment_kind text;
  v_needs_accept boolean;
  v_open_unpaid int;
  line jsonb;
  menu_item jsonb;
  opt jsonb;
  v_qty int;
  v_price int;
  v_cost int;
  v_delta_price int;
  v_delta_cost int;
  v_option_price_delta int;
  v_option_cost_delta int;
  v_combined_price int;
  v_combined_cost int;
  v_remaining jsonb;
  r record;
BEGIN
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: name required';
  END IF;

  IF length(p_customer_name) > 100 THEN
    RAISE EXCEPTION 'ORDER_INVALID: name too long';
  END IF;

  SELECT * INTO b FROM qkit.booths WHERE short_code = p_short_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_EXPIRED: unknown code';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT order_number, access_token INTO v_existing_number, v_existing_token
    FROM qkit.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'order_number', v_existing_number,
        'booth_id', b.id,
        'access_token', v_existing_token);
    END IF;
  END IF;

  IF NOT qkit.check_rate_limit('order:booth:' || b.id::text, 120, 60) THEN
    RAISE EXCEPTION 'ORDER_RATE_LIMITED: booth flood';
  END IF;

  IF NOT qkit.booth_servable(b.id) THEN
    RAISE EXCEPTION 'ORDER_UNSERVABLE: booth not serving';
  END IF;

  IF NOT qkit.booth_open(b.hours, now()) THEN
    RAISE EXCEPTION 'ORDER_UNSERVABLE: outside opening hours';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: empty cart';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'ORDER_INVALID: too many items';
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT mi INTO menu_item
    FROM jsonb_array_elements(b.menu_items) AS mi
    WHERE mi->>'id' = line->>'menuItemId';

    IF menu_item IS NULL OR NOT COALESCE((menu_item->>'available')::boolean, true) THEN
      RAISE EXCEPTION 'ORDER_ITEM_UNAVAILABLE: %', line->>'menuItemId';
    END IF;

    v_qty := GREATEST((line->>'quantity')::int, 0);
    IF v_qty = 0 THEN CONTINUE; END IF;

    IF v_qty > 20 THEN
      RAISE EXCEPTION 'ORDER_INVALID: quantity';
    END IF;

    PERFORM qkit.validate_order_options(menu_item, line->'options');

    v_option_price_delta := 0;
    v_option_cost_delta := 0;
    IF line ? 'options' AND jsonb_typeof(line->'options') = 'array' THEN
      IF jsonb_array_length(line->'options') > 20 THEN
        RAISE EXCEPTION 'ORDER_INVALID: too many options';
      END IF;
      FOR opt IN SELECT * FROM jsonb_array_elements(line->'options') LOOP
        SELECT (c->>'price_delta_cents')::int, (c->>'cost_delta_cents')::int
        INTO v_delta_price, v_delta_cost
        FROM jsonb_array_elements(COALESCE(menu_item->'option_groups', '[]'::jsonb)) AS g,
             jsonb_array_elements(g->'choices') AS c
        WHERE g->>'label' = opt->>'group'
          AND c->>'label' = opt->>'choice';

        IF NOT FOUND THEN
          RAISE EXCEPTION 'ORDER_INVALID: unknown option';
        END IF;
        v_option_price_delta := v_option_price_delta + COALESCE(v_delta_price, 0);
        v_option_cost_delta := v_option_cost_delta + COALESCE(v_delta_cost, 0);
      END LOOP;
    END IF;

    v_price := (menu_item->>'price_cents')::int;
    v_cost  := (menu_item->>'cost_cents')::int;
    v_combined_price := COALESCE(v_price, 0) + v_option_price_delta;
    v_combined_cost  := COALESCE(v_cost, 0) + v_option_cost_delta;
    v_total := v_total + v_combined_price * v_qty;

    v_priced := v_priced || jsonb_build_array(
      (line - 'price_cents' - 'cost_cents' - 'name')
      || jsonb_build_object('name', menu_item->>'name')
      -- Same "Free" convention as base price: only stamp price_cents when
      -- the item was priced OR a selected choice added a cost - an unpriced
      -- item with no priced choices stays keyless, not price_cents:0.
      || CASE WHEN v_price IS NOT NULL OR v_option_price_delta > 0
           THEN jsonb_build_object('price_cents', v_combined_price)
           ELSE '{}'::jsonb END
      || CASE WHEN v_cost IS NOT NULL OR v_option_cost_delta > 0
           THEN jsonb_build_object('cost_cents', v_combined_cost)
           ELSE '{}'::jsonb END
    );
  END LOOP;

  IF jsonb_array_length(v_priced) = 0 THEN
    RAISE EXCEPTION 'ORDER_INVALID: empty cart';
  END IF;

  v_payment_kind := b.payment->>'kind';
  v_expects_payment := v_payment_kind IS NOT NULL AND v_payment_kind <> 'stripe' AND v_total > 0;
  v_needs_accept := b.requires_arrival_confirm OR NOT b.print_enabled;

  -- Pending orders hold stock and nothing else stops an anonymous caller from
  -- opening many of them, so a payment-first booth refuses new orders while 30
  -- are still awaiting payment inside the abandonment window. Pay-at-counter
  -- booths start orders as not_required and never reach this count.
  IF v_expects_payment THEN
    SELECT count(*) INTO v_open_unpaid
    FROM qkit.orders o
    WHERE o.booth_id = b.id
      AND o.payment_status = 'pending'
      AND o.status NOT IN ('completed', 'cancelled')
      AND o.created_at > now() - interval '30 minutes';
    IF v_open_unpaid >= 30 THEN
      RAISE EXCEPTION 'ORDER_BUSY: too many unpaid orders';
    END IF;
  END IF;

  IF v_expects_payment THEN
    v_number := NULL;
  ELSE
    UPDATE qkit.booths SET order_seq = order_seq + 1
    WHERE id = b.id RETURNING order_seq INTO v_seq;
    v_number := lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');
  END IF;

  -- Paid orders no longer increment order_seq at creation. They still need
  -- the same booth lock as walkup/free orders before reading available stock.
  -- Rate-limit rows are insufficient: QR and walkup use different keys, and
  -- QR keys also change at the fixed-window boundary.
  PERFORM 1 FROM qkit.booths WHERE id = b.id FOR UPDATE;

  v_remaining := qkit.booth_remaining_stock(b.id);
  FOR r IN SELECT menu_item_id AS id, qty AS want
           FROM qkit.order_item_quantities(v_priced) LOOP
    IF v_remaining ? r.id AND r.want > (v_remaining->>r.id)::int THEN
      RAISE EXCEPTION 'ORDER_SOLD_OUT: %', r.id;
    END IF;
  END LOOP;

  INSERT INTO qkit.orders (
    booth_id, order_number, customer_name, items, total_cents,
    status, payment_status, payment_method_kind, idempotency_key
  ) VALUES (
    b.id, v_number, p_customer_name, v_priced, v_total,
    (CASE WHEN v_expects_payment OR v_needs_accept THEN 'pending' ELSE 'preparing' END)::qkit.order_status,
    (CASE WHEN v_expects_payment THEN 'pending' ELSE 'not_required' END)::qkit.payment_status,
    CASE WHEN v_expects_payment THEN v_payment_kind ELSE NULL END,
    p_idempotency_key
  )
  ON CONFLICT (booth_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING access_token INTO v_token;

  IF NOT FOUND THEN
    -- Lost the idempotency race: another request inserted first. Return its row.
    SELECT order_number, access_token INTO v_number, v_token
    FROM qkit.orders
    WHERE booth_id = b.id AND idempotency_key = p_idempotency_key;
  END IF;

  -- Cross-kit customer identity: a genuinely optional convenience, not a
  -- required identity check - skipped entirely when the customer declined to
  -- give a phone, and guarded (see header) for the CI/local Postgres that has
  -- no merqo schema at all.
  IF p_customer_phone IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.routines
      WHERE routine_schema = 'merqo' AND routine_name = 'upsert_customer'
    ) THEN
      PERFORM merqo.upsert_customer(b.vendor_id, p_customer_phone, p_customer_name);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order_number', v_number,
    'booth_id', b.id,
    'access_token', v_token);
END;
$$;

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
  v_budget := LEAST(COALESCE(b.max_items_per_order, 50), 50);
  IF v_avail->>'left' IS NOT NULL THEN
    v_budget := LEAST(v_budget, (v_avail->>'left')::int);
  END IF;

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
      IF v_avail->'remaining' ? r.id THEN
        v_take := LEAST(v_take, (v_avail->'remaining'->>r.id)::int);
      END IF;
      IF v_take > 0 THEN
        v_grant := v_grant || jsonb_build_object(r.id, v_take);
        v_total := v_total + v_take;
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

REVOKE ALL ON FUNCTION qkit.place_order(text, text, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.place_order(text, text, jsonb, uuid, text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION qkit.hold_cart(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qkit.hold_cart(uuid, uuid, jsonb) TO anon, authenticated, service_role;
