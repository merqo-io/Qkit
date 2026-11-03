-- Gives the fixed demo vendor the qkit tier, for scenes that show a gated
-- feature (daily/item stock limits, more than one booth). record.mjs runs this
-- through psql right after it signs the account up, and only against the
-- loopback database named by DEMO_DB_URL. reset.sql wipes the account, so the
-- grant never outlives a recording session.

insert into qkit.vendor_entitlements (vendor_id, tier, founder, stats_window, issued_at)
select id, 'qkit', false, '90d', now()
from auth.users
where email = 'demo-cart@qkit.local'
on conflict (vendor_id) do update set tier = 'qkit', stats_window = '90d';
