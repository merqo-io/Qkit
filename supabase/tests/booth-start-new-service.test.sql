-- 0106: "Start new service" resets a booth's daily item count. now() is fixed
-- for the whole transaction, so the "earlier in the service" orders are
-- backdated by a second; a run that starts within a second of SGT midnight
-- would see them as yesterday's.
begin;
select no_plan();

select ok(not has_function_privilege('anon', 'qkit.start_new_service(uuid)', 'EXECUTE'),
  'anonymous callers cannot start a new service');
select ok(has_function_privilege('authenticated', 'qkit.start_new_service(uuid)', 'EXECUTE'),
  'signed-in vendors can call start_new_service');
select ok(not has_column_privilege('authenticated', 'qkit.booths', 'cap_reset_at', 'UPDATE'),
  'vendors cannot write cap_reset_at directly, so they cannot pick the reset time');

insert into auth.users (id, instance_id, aud, role, email) values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','service-a@test.local'),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','service-b@test.local');
insert into qkit.vendors(id) values
 ('30000000-0000-0000-0000-000000000001'), ('30000000-0000-0000-0000-000000000002');
insert into qkit.booths (id, vendor_id, name, is_active, daily_cup_cap) values
 ('30000000-0000-0000-0000-0000000000b1','30000000-0000-0000-0000-000000000001','Morning Cart',true,5);

insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents, created_at)
values ('30000000-0000-0000-0000-0000000000b1', 'S-001', 'Cust',
        '[{"menuItemId":"m1","name":"Kopi","quantity":5}]'::jsonb, 500,
        now() - interval '1 second');

select is(qkit.booth_cups_today('30000000-0000-0000-0000-0000000000b1'), 5,
  'before any reset the count runs from midnight');
select throws_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents)
     values ('30000000-0000-0000-0000-0000000000b1', 'S-002', 'Cust',
             '[{"menuItemId":"m1","name":"Kopi","quantity":1}]'::jsonb, 100) $$,
  'P0001', null, 'a full limit refuses the next order');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is(qkit.start_new_service('30000000-0000-0000-0000-0000000000b1'), false,
  'another vendor cannot reset the booth');

select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok(
  $$ update qkit.booths set cap_reset_at = now() + interval '1 day'
     where id = '30000000-0000-0000-0000-0000000000b1' $$,
  '42501', null, 'the owner cannot set the reset time by direct update');
reset role;

select is((select cap_reset_at from qkit.booths where id = '30000000-0000-0000-0000-0000000000b1'),
  null, 'the refused calls left the booth unreset');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(qkit.start_new_service('30000000-0000-0000-0000-0000000000b1'), true,
  'the owner starts a new service');
reset role;

select is((select cap_reset_at from qkit.booths where id = '30000000-0000-0000-0000-0000000000b1'),
  now(), 'the reset is stamped with the server time');
select is(qkit.booth_cups_today('30000000-0000-0000-0000-0000000000b1'), 0,
  'orders from before the reset no longer count');
select is(qkit.booth_cups_left('30000000-0000-0000-0000-0000000000b1'), 5,
  'the customer menu sees the full limit again');

select lives_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents)
     values ('30000000-0000-0000-0000-0000000000b1', 'S-003', 'Cust',
             '[{"menuItemId":"m1","name":"Kopi","quantity":5}]'::jsonb, 500) $$,
  'the trigger takes a full limit after the reset');
select throws_ok(
  $$ insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents)
     values ('30000000-0000-0000-0000-0000000000b1', 'S-004', 'Cust',
             '[{"menuItemId":"m1","name":"Kopi","quantity":1}]'::jsonb, 100) $$,
  'P0001', null, 'the new service is capped like the old one');

update qkit.orders set status = 'cancelled'
where booth_id = '30000000-0000-0000-0000-0000000000b1' and order_number = 'S-003';
select is(qkit.booth_cups_today('30000000-0000-0000-0000-0000000000b1'), 0,
  'cancelled orders stay out of the count');

-- A reset from yesterday is older than midnight, so midnight wins.
update qkit.booths set cap_reset_at = now() - interval '2 days'
where id = '30000000-0000-0000-0000-0000000000b1';
select is(qkit.booth_cups_today('30000000-0000-0000-0000-0000000000b1'), 5,
  'a reset before today falls back to counting from midnight');

select * from finish();
rollback;
