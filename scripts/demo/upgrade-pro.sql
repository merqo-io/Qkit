-- Gives the fixed demo vendor the Pro plan, for scenes that show a gated
-- feature (daily/item stock limits, more than one booth). record.mjs runs this
-- through psql right after it signs the account up, and only against the
-- loopback database named by DEMO_DB_URL. reset.sql wipes the account, so the
-- upgrade never outlives a recording session.

update qkit.vendors
  set plan = 'pro'
  where id = (select id from auth.users where email = 'demo-cart@qkit.local');
