-- Runs against the scratch paykit database (pnpm demo:paykit-stack), never
-- qkit's. record.mjs passes the fixed demo vendor's qkit user id and the
-- hash of the kit secret as psql variables, right after the vendor signs up,
-- so paykit has a PayNow setup on file for that vendor and accepts qkit's
-- bearer secret. return_origin lets paykit's hosted pay page send the
-- customer back to the local qkit origin.
--
--   psql -v vendor_id=<uuid> -v kit_secret_hash=<sha256 hex> \
--        -v return_origin=http://localhost:3001 -f seed-paykit.sql

insert into auth.users (id, aud, role, email)
values (
  :'vendor_id'::uuid,
  'authenticated',
  'authenticated',
  :'vendor_id' || '@paykit-demo.local'
)
on conflict (id) do nothing;

insert into paykit.vendor_payment_config (vendor_id, kind, uen, payee_name, verification_method)
values (:'vendor_id'::uuid, 'paynow', '201912345A', 'Sunrise Coffee Cart', 'manual')
on conflict (vendor_id) do update
set uen = excluded.uen, payee_name = excluded.payee_name;

insert into paykit.kit_api_keys (kit_slug, secret_hash, return_origin)
values ('qkit', :'kit_secret_hash', :'return_origin')
on conflict (kit_slug) do update
set secret_hash = excluded.secret_hash, return_origin = excluded.return_origin;
