-- Local/CI-only stand-in for the slice of merqo's schema the vendor dashboard
-- reads on every render: merqo.vendor_profile and its
-- get_or_create_vendor_profile RPC (src/lib/merqo/vendor-profile.ts). Real
-- environments get these from the merqo repo's own migrations (0009, 0033)
-- on the shared project; qkit's isolated `supabase start` has no merqo
-- schema at all, so /dashboard errors there without this. Mirrors the
-- pgTAP suite's inline merqo.customers stub (supabase/tests/rls.test.sql).
-- Idempotent. Never run against a real project.
create schema if not exists merqo;

create table if not exists merqo.vendor_profile (
  vendor_id     uuid primary key,
  stall_name    text not null,
  social_links  jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table merqo.vendor_profile enable row level security;

-- Same body as merqo migration 0033's version.
create or replace function merqo.get_or_create_vendor_profile(
  p_vendor_id uuid,
  p_default_stall_name text default null
) returns merqo.vendor_profile
language plpgsql security definer set search_path = '' as $$
declare
  v_row merqo.vendor_profile;
begin
  select * into v_row from merqo.vendor_profile where vendor_id = p_vendor_id;
  if found then
    return v_row;
  end if;
  if auth.role() is distinct from 'service_role' and (auth.uid() is null or auth.uid() <> p_vendor_id) then
    raise exception 'not authorized to create profile';
  end if;
  insert into merqo.vendor_profile (vendor_id, stall_name)
  values (p_vendor_id, coalesce(nullif(p_default_stall_name, ''), 'My Stall'))
  on conflict (vendor_id) do update set vendor_id = excluded.vendor_id
  returning * into v_row;
  return v_row;
end;
$$;

grant usage on schema merqo to authenticated, service_role;
revoke all on function merqo.get_or_create_vendor_profile(uuid, text) from public, anon;
grant execute on function merqo.get_or_create_vendor_profile(uuid, text) to authenticated, service_role;

-- The admin pages count and read merqo.support_messages with the service
-- client (src/app/admin/layout.tsx), so the signed-in smoke needs the table.
create table if not exists merqo.support_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  kit_slug   text not null,
  category   text not null default 'other',
  body       text not null default '',
  status     text not null default 'open',
  created_at timestamptz not null default now()
);
alter table merqo.support_messages enable row level security;
grant select, update on merqo.support_messages to service_role;

-- PostgREST serves only the schemas in supabase/config.toml ([api] schemas),
-- which leaves merqo out on purpose: listing a schema that qkit's own
-- migrations never create would break the API for every other local use.
-- PostgREST's in-database config overrides it for this database only.
alter role authenticator set pgrst.db_schemas = 'qkit, graphql_public, merqo';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
