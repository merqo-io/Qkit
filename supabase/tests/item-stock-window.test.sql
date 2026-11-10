-- 0120: a per-item Sold-out limit counts the current service window only.
-- In-window fixtures are backdated by a second because now() is fixed for the
-- whole transaction and cap_reset_at is stamped with it; a run that starts
-- within a second of SGT midnight would see them as yesterday's.
begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email)
values ('01200000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'stock-window@test.local');
insert into qkit.vendors (id) values ('01200000-0000-0000-0000-000000000001');
insert into qkit.vendor_entitlements (vendor_id, tier, stats_window, issued_at)
values ('01200000-0000-0000-0000-000000000001', 'qkit', '90d', now());

insert into qkit.booths (id, vendor_id, name, short_code, payment, daily_cup_cap, menu_items) values
  ('01200000-0000-0000-0000-0000000000b1', '01200000-0000-0000-0000-000000000001',
   'Window', 'stockWin1', null, null,
   '[{"id":"tea","name":"Tea","available":true,"price_cents":300,"stock":3}]'),
  ('01200000-0000-0000-0000-0000000000b2', '01200000-0000-0000-0000-000000000001',
   'Reset', 'stockWin2', null, null,
   '[{"id":"tea","name":"Tea","available":true,"price_cents":300,"stock":3}]');

insert into qkit.orders (booth_id, customer_name, items, total_cents, created_at)
values ('01200000-0000-0000-0000-0000000000b1', 'Old',
        '[{"menuItemId":"tea","name":"Tea","quantity":3}]', 900, now() - interval '2 days');
select is((qkit.booth_remaining_stock('01200000-0000-0000-0000-0000000000b1')->>'tea')::int, 3,
  'orders from before the window do not count against an item limit');

insert into qkit.orders (booth_id, customer_name, items, total_cents, status, created_at)
values ('01200000-0000-0000-0000-0000000000b1', 'Cancelled',
        '[{"menuItemId":"tea","name":"Tea","quantity":3}]', 900, 'cancelled',
        now() - interval '1 second');
select is((qkit.booth_remaining_stock('01200000-0000-0000-0000-0000000000b1')->>'tea')::int, 3,
  'cancelled orders in the window do not count');

insert into qkit.orders (booth_id, customer_name, items, total_cents, created_at)
values ('01200000-0000-0000-0000-0000000000b1', 'Live',
        '[{"menuItemId":"tea","name":"Tea","quantity":2}]', 600, now() - interval '1 second');
select is((qkit.booth_remaining_stock('01200000-0000-0000-0000-0000000000b1')->>'tea')::int, 1,
  'a live order in the window counts');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_like(
  $$ select qkit.place_order('stockWin1', 'Over',
       '[{"menuItemId":"tea","quantity":2}]',
       '01200000-0000-0000-0000-0000000000c1') $$,
  '%ORDER_SOLD_OUT%', 'an order past the limit inside the window is refused');
select lives_ok(
  $$ select qkit.place_order('stockWin1', 'Last',
       '[{"menuItemId":"tea","quantity":1}]',
       '01200000-0000-0000-0000-0000000000c2') $$,
  'the last unit inside the window is accepted');
select throws_like(
  $$ select qkit.place_order('stockWin1', 'Late',
       '[{"menuItemId":"tea","quantity":1}]',
       '01200000-0000-0000-0000-0000000000c3') $$,
  '%ORDER_SOLD_OUT%', 'an item at its limit inside the window is refused');
reset role;

insert into qkit.orders (booth_id, customer_name, items, total_cents, created_at)
values ('01200000-0000-0000-0000-0000000000b2', 'Morning',
        '[{"menuItemId":"tea","name":"Tea","quantity":3}]', 900, now() - interval '1 second');
select is((qkit.booth_remaining_stock('01200000-0000-0000-0000-0000000000b2')->>'tea')::int, 0,
  'a full morning leaves nothing before the reset');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"01200000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(qkit.start_new_service('01200000-0000-0000-0000-0000000000b2'), true,
  'the owner starts a new service');
reset role;

select is((qkit.booth_remaining_stock('01200000-0000-0000-0000-0000000000b2')->>'tea')::int, 3,
  'start new service restores the full item limit');
select is((select count(*)::int from qkit.orders
           where booth_id = '01200000-0000-0000-0000-0000000000b2'), 1,
  'start new service leaves the earlier orders in place');

select * from finish();
rollback;
