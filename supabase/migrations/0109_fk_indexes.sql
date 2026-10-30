-- Index every foreign key column (Supabase advisor: unindexed foreign keys).
create index if not exists admin_audit_admin_id_idx on qkit.admin_audit (admin_id);
create index if not exists feedback_vendor_id_idx on qkit.feedback (vendor_id);
create index if not exists order_status_events_actor_idx on qkit.order_status_events (actor);
create index if not exists payments_license_id_idx on qkit.payments (license_id);
create index if not exists purchase_requests_vendor_id_idx on qkit.purchase_requests (vendor_id);
