begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email) values
  ('a0000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proof-q@test.local');
insert into qkit.vendors (id) values ('a0000000-0000-0000-0000-00000000b101') on conflict (id) do nothing;
insert into qkit.booths (id, vendor_id, name) values
  ('b0000000-0000-0000-0000-00000000b201', 'a0000000-0000-0000-0000-00000000b101', 'proof-q booth');
insert into qkit.orders (booth_id, order_number, customer_name, items, total_cents, payment_proof_path) values
  ('b0000000-0000-0000-0000-00000000b201', 'P-001', 'with proof', '[]'::jsonb, 100, 'v/proof-one.webp'),
  ('b0000000-0000-0000-0000-00000000b201', 'P-002', 'no proof', '[]'::jsonb, 100, null);

select is((select count(*)::int from qkit.proof_storage_deletions), 0, 'inserting orders queues nothing');

delete from qkit.orders where customer_name = 'no proof';
select is((select count(*)::int from qkit.proof_storage_deletions), 0, 'deleting an order without a screenshot queues nothing');

delete from qkit.booths where id = 'b0000000-0000-0000-0000-00000000b201';
select results_eq(
  $$ select bucket, path from qkit.proof_storage_deletions $$,
  $$ values ('payment-proofs'::text, 'v/proof-one.webp'::text) $$,
  'a cascade delete from the booth queues the screenshot path');

select ok(not has_table_privilege(r, 'qkit.proof_storage_deletions', p), r || ' has no ' || p || ' on the queue')
from unnest(array['anon', 'authenticated']) r,
     unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p;

select * from finish();
rollback;
