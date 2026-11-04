-- 0117: vendor_cups_between feeds Event Pass settlement, so the count must
-- cover every booth of one vendor, skip unpaid and cancelled orders, and use a
-- half-open window so back-to-back passes never double count an order.
begin;
select no_plan();

select ok(not has_function_privilege('anon', 'qkit.vendor_cups_between(uuid, timestamptz, timestamptz)', 'EXECUTE'),
  'anonymous callers cannot read usage');
select ok(not has_function_privilege('authenticated', 'qkit.vendor_cups_between(uuid, timestamptz, timestamptz)', 'EXECUTE'),
  'signed-in vendors cannot read usage');
select ok(has_function_privilege('service_role', 'qkit.vendor_cups_between(uuid, timestamptz, timestamptz)', 'EXECUTE'),
  'the service role can read usage');

insert into auth.users (id, instance_id, aud, role, email) values
 ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pass-a@test.local'),
 ('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pass-b@test.local'),
 ('40000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pass-c@test.local');
insert into qkit.vendors(id) values
 ('40000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002'),
 ('40000000-0000-0000-0000-000000000003');
insert into qkit.booths (id, vendor_id, name, is_active) values
 ('40000000-0000-0000-0000-0000000000b1','40000000-0000-0000-0000-000000000001','Cart One',true),
 ('40000000-0000-0000-0000-0000000000b2','40000000-0000-0000-0000-000000000001','Cart Two',true),
 ('40000000-0000-0000-0000-0000000000b3','40000000-0000-0000-0000-000000000002','Other Cart',true);

-- Window is 2030-01-01 00:00 to 2030-01-03 00:00 UTC.
insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents, created_at, status, payment_status) values
 ('40000000-0000-0000-0000-0000000000b1','E-001','C','[{"menuItemId":"m1","name":"Kopi","quantity":2},{"menuItemId":"m2","name":"Teh","quantity":1}]'::jsonb,300,'2030-01-01 10:00+00','pending','not_required'),
 ('40000000-0000-0000-0000-0000000000b2','E-002','C','[{"menuItemId":"m1","name":"Kopi","quantity":4}]'::jsonb,400,'2030-01-02 10:00+00','completed','confirmed'),
 ('40000000-0000-0000-0000-0000000000b1','E-003','C','[{"menuItemId":"m1","name":"Kopi","quantity":10}]'::jsonb,1000,'2030-01-02 11:00+00','cancelled','not_required'),
 ('40000000-0000-0000-0000-0000000000b1','E-004','C','[{"menuItemId":"m1","name":"Kopi","quantity":20}]'::jsonb,2000,'2030-01-02 12:00+00','pending','pending'),
 ('40000000-0000-0000-0000-0000000000b3','E-005','C','[{"menuItemId":"m1","name":"Kopi","quantity":50}]'::jsonb,5000,'2030-01-02 13:00+00','pending','not_required'),
 ('40000000-0000-0000-0000-0000000000b1','E-006','C','[{"menuItemId":"m1","name":"Kopi","quantity":100}]'::jsonb,10000,'2029-12-31 23:59:59+00','pending','not_required'),
 ('40000000-0000-0000-0000-0000000000b1','E-007','C','[{"menuItemId":"m1","name":"Kopi","quantity":1000}]'::jsonb,100000,'2030-01-03 00:00:00+00','pending','not_required');

select is(
  qkit.vendor_cups_between('40000000-0000-0000-0000-000000000001', '2030-01-01 00:00+00', '2030-01-03 00:00+00'),
  7,
  'sums quantities across booths, skipping cancelled, unpaid, other vendors and out-of-window orders');

select is(
  qkit.vendor_cups_between('40000000-0000-0000-0000-000000000001', '2030-01-01 10:00+00', '2030-01-02 10:00+00'),
  3,
  'an order exactly at the start is counted and one exactly at the end is not');

select is(
  qkit.vendor_cups_between('40000000-0000-0000-0000-000000000002', '2030-01-01 00:00+00', '2030-01-03 00:00+00'),
  50,
  'another vendor only sees their own booths');

select is(
  qkit.vendor_cups_between('40000000-0000-0000-0000-000000000003', '2030-01-01 00:00+00', '2030-01-03 00:00+00'),
  0,
  'a vendor with no orders reports zero');

select is(
  qkit.vendor_cups_between('40000000-0000-0000-0000-000000000001', '2031-01-01 00:00+00', '2031-01-03 00:00+00'),
  0,
  'an empty window reports zero');

update qkit.orders set payment_status = 'claimed' where order_number = 'E-004';
select is(
  qkit.vendor_cups_between('40000000-0000-0000-0000-000000000001', '2030-01-01 00:00+00', '2030-01-03 00:00+00'),
  27,
  'an order stops being excluded once its payment is no longer pending');

select * from finish();
rollback;
