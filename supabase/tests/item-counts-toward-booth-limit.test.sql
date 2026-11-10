-- 0121: a menu item with excludeFromBoothLimit does not use up the booth's
-- daily item limit. An absent flag counts, so existing booths are unchanged.
begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email) values
 ('31000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','limit-a@test.local');
insert into qkit.vendors(id) values ('31000000-0000-0000-0000-000000000001');

insert into qkit.booths (id, vendor_id, name, is_active, daily_cup_cap, max_items_per_order, menu_items) values
 ('31000000-0000-0000-0000-0000000000b1','31000000-0000-0000-0000-000000000001','Limit Cart',true,5,null,
  '[{"id":"m1","name":"Kopi","price_cents":100},
    {"id":"m2","name":"Special","price_cents":300,"excludeFromBoothLimit":true},
    {"id":"m3","name":"Tea","price_cents":100,"excludeFromBoothLimit":false}]'::jsonb);

insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents, source)
values ('31000000-0000-0000-0000-0000000000b1', 'L-001', 'Cust',
        '[{"menuItemId":"m1","name":"Kopi","quantity":5},
          {"menuItemId":"m2","name":"Special","quantity":3}]'::jsonb, 1400, 'qr');

update qkit.booths set max_items_per_order = 6
where id = '31000000-0000-0000-0000-0000000000b1';

select is(qkit.booth_cups_today('31000000-0000-0000-0000-0000000000b1'), 5,
  'excluded items stay out of the booth count');
select is(qkit.booth_cups_left('31000000-0000-0000-0000-0000000000b1'), 0,
  'the booth is at its limit');

select lives_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents, source)
     values ('31000000-0000-0000-0000-0000000000b1', 'L-002', 'Cust',
             '[{"menuItemId":"m2","name":"Special","quantity":4}]'::jsonb, 1200, 'qr') $$,
  'an order of only excluded items is accepted at the limit');
select throws_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents, source)
     values ('31000000-0000-0000-0000-0000000000b1', 'L-003', 'Cust',
             '[{"menuItemId":"m1","name":"Kopi","quantity":1}]'::jsonb, 100, 'qr') $$,
  'P0001', null, 'a counted item is still refused at the limit');
select throws_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents, source)
     values ('31000000-0000-0000-0000-0000000000b1', 'L-004', 'Cust',
             '[{"menuItemId":"m3","name":"Tea","quantity":1}]'::jsonb, 100, 'qr') $$,
  'P0001', null, 'a flag set to false counts like an absent one');
select throws_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents, source)
     values ('31000000-0000-0000-0000-0000000000b1', 'L-005', 'Cust',
             '[{"menuItemId":"m2","name":"Special","quantity":4},
               {"menuItemId":"m1","name":"Kopi","quantity":1}]'::jsonb, 1300, 'qr') $$,
  'P0001', null, 'a mixed order is refused for its counted part');

select is(qkit.booth_cups_today('31000000-0000-0000-0000-0000000000b1'), 5,
  'accepted excluded orders did not move the count');

select throws_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents, source)
     values ('31000000-0000-0000-0000-0000000000b1', 'L-006', 'Cust',
             '[{"menuItemId":"m2","name":"Special","quantity":7}]'::jsonb, 2100, 'qr') $$,
  'P0001', null, 'max_items_per_order still counts excluded items');

update qkit.orders set status = 'cancelled'
where booth_id = '31000000-0000-0000-0000-0000000000b1' and order_number = 'L-001';
select is(qkit.booth_cups_today('31000000-0000-0000-0000-0000000000b1'), 0,
  'cancelled orders stay out of the count');
select is(qkit.booth_cups_left('31000000-0000-0000-0000-0000000000b1'), 5,
  'excluded items do not reduce the items left');

insert into qkit.cart_holds (booth_id, session_id, items, qty, expires_at) values
 ('31000000-0000-0000-0000-0000000000b1','31000000-0000-0000-0000-0000000000c1',
  '{"m1":2,"m2":3}'::jsonb, 5, now() + interval '5 minutes');
select is((qkit.booth_availability('31000000-0000-0000-0000-0000000000b1', null)->>'left')::int, 3,
  'another basket''s excluded items do not take from the booth total');

select * from finish();
rollback;
