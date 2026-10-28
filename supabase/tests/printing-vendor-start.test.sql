-- 0107: a connected printer is not authority to start a non-payment order.
begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email) values
 ('31000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','printing-start@test.local'),
 ('31000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','printing-other@test.local');
insert into qkit.vendors(id) values ('31000000-0000-0000-0000-000000000001'), ('31000000-0000-0000-0000-000000000002');
insert into qkit.booths (id, vendor_id, name, print_enabled) values
 ('31000000-0000-0000-0000-0000000000b1','31000000-0000-0000-0000-000000000001','Printing Cart',true),
 ('31000000-0000-0000-0000-0000000000b2','31000000-0000-0000-0000-000000000002','Other Cart',false);

insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents, status, payment_status, source) values
 ('31000000-0000-0000-0000-0000000000b1','T-001','QR','[]',0,'preparing','not_required','qr'),
 ('31000000-0000-0000-0000-0000000000b1','T-002','Walkup','[]',0,'preparing','not_required','walkup'),
 ('31000000-0000-0000-0000-0000000000b1','T-003','Paid','[]',100,'preparing','confirmed','walkup'),
 ('31000000-0000-0000-0000-0000000000b2','T-004','No printer','[]',0,'preparing','not_required','walkup'),
 ('31000000-0000-0000-0000-0000000000b1','T-005','Unpaid','[]',100,'pending','pending','qr');

select is((select status::text from qkit.orders where order_number='T-001' and booth_id='31000000-0000-0000-0000-0000000000b1'), 'pending', 'QR non-payment order waits for Start');
select is((select status::text from qkit.orders where order_number='T-002' and booth_id='31000000-0000-0000-0000-0000000000b1'), 'pending', 'walk-up non-payment order waits for Start');
select is((select status::text from qkit.orders where order_number='T-003' and booth_id='31000000-0000-0000-0000-0000000000b1'), 'preparing', 'already-paid walk-up keeps its fulfillment state');
select is((select status::text from qkit.orders where order_number='T-004' and booth_id='31000000-0000-0000-0000-0000000000b2'), 'preparing', 'booth without printing keeps existing behavior');
select is((select status::text from qkit.orders where order_number='T-005' and booth_id='31000000-0000-0000-0000-0000000000b1'), 'pending', 'payment order remains pending');

update qkit.orders set status='preparing' where order_number='T-001' and booth_id='31000000-0000-0000-0000-0000000000b1';
select is((select status::text from qkit.orders where order_number='T-001' and booth_id='31000000-0000-0000-0000-0000000000b1'), 'preparing', 'vendor Start is not reversed by the insert trigger');
select ok(not has_function_privilege('anon', 'qkit.require_vendor_start_for_printing()', 'EXECUTE'), 'anonymous callers cannot execute the trigger function');
select ok(not has_function_privilege('authenticated', 'qkit.require_vendor_start_for_printing()', 'EXECUTE'), 'signed-in callers cannot execute the trigger function');
update qkit.booths set menu_items='[{"id":"free1","name":"Kopi","price_cents":0,"available":true}]'::jsonb
where id='31000000-0000-0000-0000-0000000000b1';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok(
 $$ select qkit.place_walkup_order('31000000-0000-0000-0000-0000000000b1','RPC Walkup',
      '[{"menuItemId":"free1","name":"Kopi","quantity":1}]'::jsonb,false) $$,
 'the actual walk-up RPC still places an order');
reset role;
select is((select status::text from qkit.orders where customer_name='RPC Walkup' and booth_id='31000000-0000-0000-0000-0000000000b1'), 'pending', 'the walk-up RPC also waits for vendor Start');
select * from finish();
rollback;
