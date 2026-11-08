-- Parity with servableBoothIds in src/lib/booth/access.ts: the same cases run
-- through qkit.booth_servable here and through the TS function in
-- src/lib/booth/servable-parity.test.ts. The embedded literal must equal
-- supabase/tests/fixtures/booth-servable.json (the Vitest mirror checks it).

begin;
select plan(5);

create temp table _fixture on commit drop as
select $fixture${
  "cases": [
    {
      "name": "free serves only the oldest active booth",
      "vendor_id": "00d12000-0000-0000-0000-000000000001",
      "tier": "free",
      "booths": [
        { "id": "00d12001-0000-0000-0000-000000000003", "is_active": true, "created_at": "2026-03-01T00:00:00Z" },
        { "id": "00d12001-0000-0000-0000-000000000001", "is_active": true, "created_at": "2026-01-01T00:00:00Z" },
        { "id": "00d12001-0000-0000-0000-000000000002", "is_active": false, "created_at": "2026-02-01T00:00:00Z" },
        { "id": "00d12001-0000-0000-0000-000000000004", "is_active": true, "created_at": "2026-04-01T00:00:00Z" }
      ],
      "expected": ["00d12001-0000-0000-0000-000000000001"]
    },
    {
      "name": "free skips an inactive older booth",
      "vendor_id": "00d12000-0000-0000-0000-000000000002",
      "tier": "free",
      "booths": [
        { "id": "00d12002-0000-0000-0000-000000000001", "is_active": false, "created_at": "2026-01-01T00:00:00Z" },
        { "id": "00d12002-0000-0000-0000-000000000002", "is_active": true, "created_at": "2026-02-01T00:00:00Z" },
        { "id": "00d12002-0000-0000-0000-000000000003", "is_active": true, "created_at": "2026-03-01T00:00:00Z" }
      ],
      "expected": ["00d12002-0000-0000-0000-000000000002"]
    },
    {
      "name": "starter is capped at one active booth",
      "vendor_id": "00d12000-0000-0000-0000-000000000003",
      "tier": "starter",
      "booths": [
        { "id": "00d12003-0000-0000-0000-000000000001", "is_active": true, "created_at": "2026-02-01T00:00:00Z" },
        { "id": "00d12003-0000-0000-0000-000000000002", "is_active": true, "created_at": "2026-01-01T00:00:00Z" }
      ],
      "expected": ["00d12003-0000-0000-0000-000000000002"]
    },
    {
      "name": "qkit serves every active booth and no inactive one",
      "vendor_id": "00d12000-0000-0000-0000-000000000004",
      "tier": "qkit",
      "booths": [
        { "id": "00d12004-0000-0000-0000-000000000001", "is_active": true, "created_at": "2026-01-01T00:00:00Z" },
        { "id": "00d12004-0000-0000-0000-000000000002", "is_active": false, "created_at": "2026-02-01T00:00:00Z" },
        { "id": "00d12004-0000-0000-0000-000000000003", "is_active": true, "created_at": "2026-03-01T00:00:00Z" }
      ],
      "expected": [
        "00d12004-0000-0000-0000-000000000001",
        "00d12004-0000-0000-0000-000000000003"
      ]
    },
    {
      "name": "a vendor with only inactive booths serves none",
      "vendor_id": "00d12000-0000-0000-0000-000000000005",
      "tier": "free",
      "booths": [
        { "id": "00d12005-0000-0000-0000-000000000001", "is_active": false, "created_at": "2026-01-01T00:00:00Z" }
      ],
      "expected": []
    }
  ]
}$fixture$::jsonb as j;

create temp table _cases on commit drop as
select
  (c->>'name') as name,
  (c->>'vendor_id')::uuid as vendor_id,
  (c->>'tier') as tier,
  (c->'booths') as booths,
  (c->'expected') as expected
from _fixture, jsonb_array_elements(j->'cases') c;

insert into auth.users (id, instance_id, aud, role, email)
select vendor_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'servable-' || vendor_id || '@test.local'
from _cases;

insert into qkit.vendors (id) select vendor_id from _cases;

-- qkit tier first so the creation cap allows the multi-booth fixtures.
insert into qkit.vendor_entitlements (vendor_id, tier, stats_window, issued_at)
select vendor_id, 'qkit', '90d', now() from _cases;

insert into qkit.booths (id, vendor_id, name, is_active, created_at)
select (b->>'id')::uuid, c.vendor_id, 'servable ' || (b->>'id'),
  (b->>'is_active')::boolean, (b->>'created_at')::timestamptz
from _cases c, jsonb_array_elements(c.booths) b;

update qkit.vendor_entitlements e
set tier = c.tier,
    stats_window = case when c.tier = 'free' then '24h' else '90d' end
from _cases c
where e.vendor_id = c.vendor_id and c.tier <> 'qkit';

select is(
  (select coalesce(jsonb_agg(b.id::text order by b.id::text), '[]'::jsonb)
     from qkit.booths b
    where b.vendor_id = c.vendor_id and qkit.booth_servable(b.id)),
  (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
     from jsonb_array_elements_text(c.expected) x),
  c.name
)
from _cases c
order by c.vendor_id;

select * from finish();
rollback;
