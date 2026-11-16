import { resolveEntitlement, storedFromRow } from "@/lib/plan";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Whether the customer pages carry the "Powered by Merqo" line: only for a
 * vendor on Free (a running Event Pass counts as Pro). Any read failure answers
 * false, so a paying vendor is never branded by a blip and the page and the
 * order flow render as if the line did not exist.
 */
export async function showPoweredByMerqo(vendorId: string): Promise<boolean> {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("vendor_entitlements")
      .select(
        "tier, founder, stats_window, event_pass_starts_at, event_pass_ends_at, valid_until",
      )
      .eq("vendor_id", vendorId)
      .maybeSingle();
    if (error) return false;
    const ent = resolveEntitlement(
      data ? storedFromRow(data) : null,
      Date.now(),
    );
    return ent.tier === "free" && ent.eventPass?.running !== true;
  } catch {
    return false;
  }
}

/** Same answer for a booth id, for pages whose public RPC does not return the vendor. */
export async function showPoweredByMerqoForBooth(
  boothId: string,
): Promise<boolean> {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("booths")
      .select("vendor_id")
      .eq("id", boothId)
      .maybeSingle();
    if (error || !data) return false;
    return await showPoweredByMerqo(data.vendor_id);
  } catch {
    return false;
  }
}
