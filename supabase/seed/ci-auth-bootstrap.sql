-- CI-only bootstrap for the order e2e job. The coffee-cart seed reuses the
-- developer's real "Test" vendor (vendors.id → auth.users.id), which exists in a
-- local dev DB but NOT in a fresh `supabase start` CI database — so the booth
-- insert there fails the vendor FK. Create that auth user + vendor idempotently
-- first, and put it on the qkit tier: the order specs cover counter-ops paths
-- (TV display, order-ready push) that free-tier vendors do not get. Never run against a real project; this is a fixed, well-known test id.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '6df824a1-9da2-4608-ad13-2400a9114ec0',
  'authenticated', 'authenticated',
  'e2e-test@qkit.local', '',
  now(), now(), now(),
  '', '', '', ''
)
on conflict (id) do nothing;

insert into qkit.vendors (id)
values ('6df824a1-9da2-4608-ad13-2400a9114ec0')
on conflict (id) do nothing;

insert into qkit.vendor_entitlements (vendor_id, tier, founder, stats_window, issued_at)
values ('6df824a1-9da2-4608-ad13-2400a9114ec0', 'qkit', false, '90d', now())
on conflict (vendor_id) do update set tier = 'qkit', stats_window = '90d';
