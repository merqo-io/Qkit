-- A per-item "Sold-out limit" (menu_items[].stock) and the booth's daily item
-- limit (booths.daily_cup_cap, 0094/0106) could not be used together: the item
-- limit read qkit.booth_item_sold (0028), a lifetime counter nothing resets, so
-- a drink with a limit showed "Sold out" forever once it had sold that many.
-- The daily count is windowed: orders since SGT midnight or booths.cap_reset_at
-- ("Start new service"), whichever is later.
--
-- booth_remaining_stock now counts the same window, straight from orders, so
-- midnight and "Start new service" reset both limits. The window expression is
-- copied from booth_cups_today (0106) rather than shared through a helper:
-- a helper would only pay off by re-pointing booth_cups_today and
-- enforce_daily_cup_cap at it, which re-emits two more functions for no
-- behaviour change. If the window ever changes, change all three together.
--
-- Counting rules match booth_cups_today: status <> 'cancelled', and unpaid
-- (pending-payment) orders still hold stock. Per-line quantities come from
-- order_item_quantities (0034), the helper the gate has always shared with the
-- old counter, so clamping stays identical.
--
-- booth_item_sold and its triggers (orders_stock_sync_*, apply_order_stock_delta)
-- are left in place: nothing reads them for stock any more, but dropping them
-- would touch types.ts, two pgTAP files and several READMEs for no user-visible
-- gain. They cost one small upsert per order and can be dropped in a cleanup.
--
-- Concurrency: place_order and place_walkup_order call this function after
-- taking the booth row lock (SELECT ... FOR UPDATE, 0111). A STABLE function
-- called from a VOLATILE plpgsql function runs with a fresh snapshot per
-- statement under READ COMMITTED, so a second order that waited on the lock
-- reads the first order's committed row when it counts. The window scan reads
-- orders, which the first order's INSERT has already committed by the time the
-- lock is released, so two concurrent last-unit orders still cannot both pass.
--
-- Signature, return shape, SECURITY DEFINER, STABLE and search_path are
-- unchanged. CREATE OR REPLACE keeps the grants the function already has, so no
-- GRANT or REVOKE is restated. orders(booth_id, created_at) is already indexed
-- (0013), which serves the window scan.

CREATE OR REPLACE FUNCTION qkit.booth_remaining_stock(p_booth_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = qkit
AS $$
  WITH caps AS (
    SELECT mi->>'id' AS menu_item_id, (mi->>'stock')::INT AS stock
    FROM qkit.booths b
    CROSS JOIN LATERAL jsonb_array_elements(b.menu_items) AS mi
    WHERE b.id = p_booth_id
      AND jsonb_typeof(mi->'stock') = 'number'
  ),
  sold AS (
    SELECT q.menu_item_id, SUM(q.qty)::INT AS qty
    FROM qkit.orders o
    CROSS JOIN LATERAL qkit.order_item_quantities(o.items) AS q
    WHERE o.booth_id = p_booth_id
      AND o.status <> 'cancelled'
      AND o.created_at >= GREATEST(
            date_trunc('day', now() AT TIME ZONE 'Asia/Singapore')
              AT TIME ZONE 'Asia/Singapore',
            (SELECT b.cap_reset_at FROM qkit.booths b WHERE b.id = p_booth_id)
          )
    GROUP BY q.menu_item_id
  )
  SELECT COALESCE(
    jsonb_object_agg(
      caps.menu_item_id,
      GREATEST(caps.stock - COALESCE(s.qty, 0), 0)
    ),
    '{}'::JSONB
  )
  FROM caps
  LEFT JOIN sold s ON s.menu_item_id = caps.menu_item_id;
$$;
