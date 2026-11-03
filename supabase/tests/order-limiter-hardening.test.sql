-- Migration 0111: per-booth basket-hold bucket (180/min) and the ORDER_BUSY
-- cap on unpaid orders at a payment-first booth. Fixtures roll back.
begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email)
values ('01110000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'limiter-vendor@test.local');
insert into qkit.vendors (id)
values ('01110000-0000-0000-0000-000000000001');
insert into qkit.vendor_entitlements (vendor_id, tier, stats_window, issued_at)
values ('01110000-0000-0000-0000-000000000001', 'qkit', '90d', now());

insert into qkit.booths (id, vendor_id, name, short_code, payment, daily_cup_cap, menu_items) values
  ('01110000-0000-0000-0000-0000000000b1', '01110000-0000-0000-0000-000000000001',
   'Pay first', 'limitPay1', '{"kind":"paynow"}', null,
   '[{"id":"coffee","name":"Coffee","available":true,"price_cents":500}]'),
  ('01110000-0000-0000-0000-0000000000b2', '01110000-0000-0000-0000-000000000001',
   'Counter', 'limitCtr1', null, null,
   '[{"id":"coffee","name":"Coffee","available":true,"price_cents":500}]'),
  ('01110000-0000-0000-0000-0000000000b3', '01110000-0000-0000-0000-000000000001',
   'Pay first old', 'limitOld1', '{"kind":"paynow"}', null,
   '[{"id":"coffee","name":"Coffee","available":true,"price_cents":500}]'),
  ('01110000-0000-0000-0000-0000000000b4', '01110000-0000-0000-0000-000000000001',
   'Held', 'limitHold1', null, 100,
   '[{"id":"coffee","name":"Coffee","available":true,"price_cents":500}]');

-- Open unpaid orders on the pay-first booth: 29, one short of the cap.
insert into qkit.orders (booth_id, customer_name, items, total_cents, status,
                         payment_status, payment_method_kind)
select '01110000-0000-0000-0000-0000000000b1', 'Seed ' || g,
       '[{"menuItemId":"coffee","quantity":1}]', 500, 'pending', 'pending', 'paynow'
from generate_series(1, 29) g;

-- Counter booth: 30 unpaid-looking rows must not count, it is not payment-first.
insert into qkit.orders (booth_id, customer_name, items, total_cents, status,
                         payment_status)
select '01110000-0000-0000-0000-0000000000b2', 'Seed ' || g,
       '[{"menuItemId":"coffee","quantity":1}]', 500, 'pending', 'pending'
from generate_series(1, 30) g;

-- Old-window booth: 30 stale unpaid orders plus 30 recent cancelled ones, none count.
insert into qkit.orders (booth_id, customer_name, items, total_cents, status,
                         payment_status, payment_method_kind, created_at)
select '01110000-0000-0000-0000-0000000000b3', 'Old ' || g,
       '[{"menuItemId":"coffee","quantity":1}]', 500, 'pending', 'pending', 'paynow',
       now() - interval '31 minutes'
from generate_series(1, 30) g;
insert into qkit.orders (booth_id, customer_name, items, total_cents, status,
                         payment_status, payment_method_kind)
select '01110000-0000-0000-0000-0000000000b3', 'Cancelled ' || g,
       '[{"menuItemId":"coffee","quantity":1}]', 500, 'cancelled', 'pending', 'paynow'
from generate_series(1, 30) g;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select lives_ok(
  $$ select qkit.place_order('limitPay1', 'Customer 30',
       '[{"menuItemId":"coffee","quantity":1}]',
       '01110000-0000-0000-0000-0000000000c1') $$,
  'the 30th open unpaid order is accepted');
select throws_like(
  $$ select qkit.place_order('limitPay1', 'Customer 31',
       '[{"menuItemId":"coffee","quantity":1}]',
       '01110000-0000-0000-0000-0000000000c2') $$,
  '%ORDER_BUSY%', 'a payment-first booth with 30 open unpaid orders refuses another');
select lives_ok(
  $$ select qkit.place_order('limitPay1', 'Customer 30',
       '[{"menuItemId":"coffee","quantity":1}]',
       '01110000-0000-0000-0000-0000000000c1') $$,
  'an idempotent replay still returns at the cap');
select lives_ok(
  $$ select qkit.place_order('limitCtr1', 'Counter customer',
       '[{"menuItemId":"coffee","quantity":1}]',
       '01110000-0000-0000-0000-0000000000c3') $$,
  'a booth that is not payment-first ignores the unpaid count');
select lives_ok(
  $$ select qkit.place_order('limitOld1', 'Late customer',
       '[{"menuItemId":"coffee","quantity":1}]',
       '01110000-0000-0000-0000-0000000000c4') $$,
  'orders older than 30 minutes and cancelled orders do not count');
reset role;

select is((select count(*)::int from qkit.orders
           where booth_id = '01110000-0000-0000-0000-0000000000b1'),
          30, 'the refused and replayed orders added no extra row');

-- hold_cart bucket. check_rate_limit floors now(), which is fixed for the whole
-- transaction, so the seeded window is the one the call increments.
insert into qkit.rate_limits (key, window_start, count)
values ('hold:booth:01110000-0000-0000-0000-0000000000b4',
        to_timestamp(floor(extract(epoch from now()) / 60) * 60), 178);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok(
  $$ select qkit.hold_cart('01110000-0000-0000-0000-0000000000b4',
       '01110000-0000-0000-0000-0000000000d1',
       '[{"menuItemId":"coffee","quantity":1}]') $$,
  'a hold at 179 calls in the minute runs');
select lives_ok(
  $$ select qkit.hold_cart('01110000-0000-0000-0000-0000000000b4',
       '01110000-0000-0000-0000-0000000000d2',
       '[{"menuItemId":"coffee","quantity":1}]') $$,
  'the 180th hold in the minute still runs');
select lives_ok(
  $$ select qkit.hold_cart('01110000-0000-0000-0000-0000000000b4',
       '01110000-0000-0000-0000-0000000000d3',
       '[{"menuItemId":"coffee","quantity":1}]') $$,
  'the 181st hold returns without raising');
reset role;

select is((select count(*)::int from qkit.cart_holds
           where booth_id = '01110000-0000-0000-0000-0000000000b4'
             and session_id in ('01110000-0000-0000-0000-0000000000d1',
                                '01110000-0000-0000-0000-0000000000d2')),
          2, 'holds within the 180 cap are stored');
select is((select count(*)::int from qkit.cart_holds
           where booth_id = '01110000-0000-0000-0000-0000000000b4'
             and session_id = '01110000-0000-0000-0000-0000000000d3'),
          0, 'the hold over 180 a minute is not stored');

select ok(has_function_privilege('anon', 'qkit.place_order(text,text,jsonb,uuid,text)', 'EXECUTE'),
          'anon can place an order');
select ok(has_function_privilege('authenticated', 'qkit.place_order(text,text,jsonb,uuid,text)', 'EXECUTE'),
          'authenticated can place an order');
select ok(has_function_privilege('anon', 'qkit.hold_cart(uuid,uuid,jsonb)', 'EXECUTE'),
          'anon can hold a cart');
select ok(has_function_privilege('authenticated', 'qkit.hold_cart(uuid,uuid,jsonb)', 'EXECUTE'),
          'authenticated can hold a cart');
select ok(has_function_privilege('service_role', 'qkit.hold_cart(uuid,uuid,jsonb)', 'EXECUTE'),
          'service_role can hold a cart');
select ok(not exists (
            select 1 from pg_proc p, aclexplode(p.proacl) a
            where p.oid = 'qkit.place_order(text,text,jsonb,uuid,text)'::regprocedure
              and a.grantee = 0),
          'PUBLIC has no EXECUTE on place_order');
select ok(not exists (
            select 1 from pg_proc p, aclexplode(p.proacl) a
            where p.oid = 'qkit.hold_cart(uuid,uuid,jsonb)'::regprocedure
              and a.grantee = 0),
          'PUBLIC has no EXECUTE on hold_cart');
select ok((select prosecdef from pg_proc
           where oid = 'qkit.place_order(text,text,jsonb,uuid,text)'::regprocedure),
          'place_order is SECURITY DEFINER');
select ok((select prosecdef from pg_proc
           where oid = 'qkit.hold_cart(uuid,uuid,jsonb)'::regprocedure),
          'hold_cart is SECURITY DEFINER');
select is((select proconfig from pg_proc
           where oid = 'qkit.place_order(text,text,jsonb,uuid,text)'::regprocedure),
          array['search_path=qkit'], 'place_order pins search_path to qkit');
select is((select proconfig from pg_proc
           where oid = 'qkit.hold_cart(uuid,uuid,jsonb)'::regprocedure),
          array['search_path=qkit'], 'hold_cart pins search_path to qkit');

select * from finish();
rollback;
