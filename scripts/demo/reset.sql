-- Demo reset â€” wipe the fixed demo vendor so every recording starts identical.
-- Run against LOCAL Supabase only (never prod):
--   psql "$(pnpm exec supabase status -o env | grep DB_URL | cut -d= -f2-)" -f scripts/demo/reset.sql
-- (or use the DB URL printed by `pnpm exec supabase status`).
--
-- The recorder (record.mjs) registers this exact email live on camera, so the
-- account must not already exist. Deleting it leaf-up clears the whole tree even
-- if a FK isn't ON DELETE CASCADE.

do $$
declare
  demo_uid uuid;
begin
  select id into demo_uid from auth.users where email = 'demo-cart@qkit.local';
  if demo_uid is null then
    raise notice 'No demo account present â€” nothing to reset.';
    return;
  end if;

  delete from qkit.orders
    where booth_id in (select id from qkit.booths where vendor_id = demo_uid);
  delete from qkit.booths where vendor_id = demo_uid;
  delete from qkit.vendors where id = demo_uid;
  delete from auth.users where id = demo_uid;

  raise notice 'Demo account % wiped.', demo_uid;
end $$;

-- The dashboard's legal gate asks merqo, which a local stack cannot reach, and
-- fails closed to /legal/accept. A cached "current" answer lets the vendor
-- through; checked_at is set a day ahead so the 5 minute cache TTL cannot lapse
-- mid-recording.
insert into qkit.legal_check_state (email, checked_at, is_current)
  values ('demo-cart@qkit.local', now() + interval '1 day', true)
  on conflict (email) do update
    set checked_at = excluded.checked_at, is_current = true;