-- Merqo owns subscriptions now; qkit's local billing state is retired.
-- payments keeps its historical rows (merqo's revenue metric still sums them)
-- but loses the link to licenses, which no longer exist.
DROP INDEX IF EXISTS qkit.payments_license_id_idx;
ALTER TABLE qkit.payments DROP COLUMN license_id;

DROP FUNCTION qkit.set_license_label(UUID, TEXT);
DROP TABLE qkit.purchase_requests;
DROP TABLE qkit.licenses;
DROP TABLE qkit.pricing;
ALTER TABLE qkit.vendors DROP COLUMN plan;
