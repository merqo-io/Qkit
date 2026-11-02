import type { createServiceClient } from "@/lib/supabase/server";
import { boardSettingsSchema } from "@/lib/schemas";
import { displayOrderNumber } from "@/lib/orders";
import { numberingBaselines } from "@/lib/daily-order-number";
import { baselineFor } from "@/lib/numbering-baselines";

/**
 * board_settings-derived heading number: the daily-reset number (see
 * displayOrderNumber in @/lib/orders) when the vendor turned that on.
 * Decorative, so any failure here degrades to the real order_number rather
 * than breaking the page — same philosophy as the status page's loadVendorProfile.
 */
export async function resolveOrderDisplay(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  boothId: string,
  vendorId: string,
  order: { orderNumber: string; createdAt: string },
): Promise<string> {
  const { orderNumber, createdAt } = order;
  try {
    const { data: vendorRow } = await supabase
      .from("vendors")
      .select("board_settings")
      .eq("id", vendorId)
      .maybeSingle();
    const settings = boardSettingsSchema.safeParse(vendorRow?.board_settings);
    if (!settings.success || !settings.data.daily_order_number_reset)
      return orderNumber;

    return displayOrderNumber(
      orderNumber,
      baselineFor(createdAt, await numberingBaselines(supabase, boothId)),
    );
  } catch (err) {
    console.error(
      "order-status: daily display-number read failed",
      err instanceof Error ? err.message : err,
    );
    return orderNumber;
  }
}
