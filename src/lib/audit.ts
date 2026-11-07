import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types";

export type AuditEntry = Database["qkit"]["Tables"]["admin_audit"]["Insert"];
export type OrderStatusEventEntry =
  Database["qkit"]["Tables"]["order_status_events"]["Insert"];

/**
 * Append a row to `qkit.admin_audit`. Best-effort: a failure here must never
 * fail the caller's own action — only logged, so a broken trail stays
 * visible without ever surfacing to the end user.
 *
 * The column is named `admin_id` but is just a FK to `auth.users` — it's
 * reused as the generic "actor" for any authenticated write worth being able
 * to reconstruct later, not only admin actions. A vendor-initiated action
 * (e.g. advancing their own order) passes the vendor's own `auth.uid()`.
 *
 * `admin_audit` has no INSERT policy for `authenticated`/`anon` (service-
 * role-write-only, migration 0006) — this always goes through its own
 * service-role client, so callers running on the authenticated client (e.g.
 * order-action-helpers.ts) can use it exactly like a service-role caller would.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const { error } = await supabase.from("admin_audit").insert(entry);
    if (error) console.error("admin_audit insert failed", error.message);
  } catch (err) {
    console.error("admin_audit insert failed", err);
  }
}

/**
 * Append a row to `qkit.order_status_events` — the append-only history of an
 * order's `status` column transitions (migration 0078). Same best-effort,
 * service-role-only rationale as recordAudit above: never blocks the caller,
 * and the table has no INSERT policy for authenticated/anon.
 */
export async function recordOrderStatusEvent(
  entry: OrderStatusEventEntry,
): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const { error } = await supabase.from("order_status_events").insert(entry);
    if (error)
      console.error("order_status_events insert failed", error.message);
  } catch (err) {
    console.error("order_status_events insert failed", err);
  }
}
