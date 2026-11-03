import { createServiceClient } from "@/lib/supabase/server";
import { resolveEntitlement, storedFromRow } from "@/lib/plan";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * Whether a vendor's plan includes counter ops: the customer TV display,
 * printkit labels and order-ready push. Server-side counterpart to
 * `Entitlement.counterOps` for paths that run without the vendor's session
 * (customer pages, fire-and-forget notifiers). A failed read answers false:
 * these paths are all best-effort extras, so skipping beats sending to a
 * vendor who may not be entitled.
 */
export async function vendorHasCounterOps(
  supabase: ServiceClient,
  vendorId: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const { data, error } = await supabase
    .from("vendor_entitlements")
    .select(
      "tier, founder, stats_window, event_pass_starts_at, event_pass_ends_at, valid_until",
    )
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (error) {
    console.error("vendorHasCounterOps: read failed", error.message);
    return false;
  }
  return resolveEntitlement(data ? storedFromRow(data) : null, nowMs)
    .counterOps;
}

/** Same check keyed by an order id, for callers that only hold the order. */
export async function orderHasCounterOps(
  supabase: ServiceClient,
  orderId: string,
): Promise<boolean> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("booth_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) return false;
  const { data: booth } = await supabase
    .from("booths")
    .select("vendor_id")
    .eq("id", order.booth_id)
    .maybeSingle();
  if (!booth) return false;
  return vendorHasCounterOps(supabase, booth.vendor_id);
}

/**
 * Order-keyed check that builds its own service-role client, for server
 * actions outside `src/lib` that may not import the service client directly.
 */
export async function orderHasCounterOpsForAction(
  orderId: string,
): Promise<boolean> {
  return orderHasCounterOps(await createServiceClient(), orderId);
}
