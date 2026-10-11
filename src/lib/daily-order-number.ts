import type { createServiceClient } from "@/lib/supabase/server";
import { displayOrderNumber } from "@/lib/orders";
import { boardSettingsSchema } from "@/lib/schemas";
import { readAllRows } from "@/lib/supabase/read-all";
import { sgtStartOfDayIso } from "@/lib/tz";

type Client = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * The booth's first order_number of the SGT day, or null when it has had no
 * order yet today. This is the baseline `displayOrderNumber` ranks against
 * when a vendor has daily numbering on.
 *
 * One query, shared by every server path that shows a ticket number for a
 * single booth (the customer's status page, the TV display, the printed
 * label, the Telegram alert), so they cannot drift apart. The order board
 * reads many booths at once and has its own query.
 */
export async function firstOrderNumberToday(
  client: Client,
  boothId: string,
): Promise<string | null> {
  const { data } = await client
    .from("orders")
    .select("order_number")
    .eq("booth_id", boothId)
    .gte("created_at", sgtStartOfDayIso())
    .order("order_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.order_number ?? null;
}

/**
 * firstOrderNumberToday for many booths at once, keyed by booth id: the
 * vendor's order board and their Completed page. A booth with no numbered
 * order yet today has no key. A failed read returns nothing, so tickets fall
 * back to their permanent numbers instead of the page failing over a number.
 */
export async function firstOrderNumbersToday(
  client: Client,
  boothIds: string[],
): Promise<Record<string, string>> {
  const baselines: Record<string, string> = {};
  if (boothIds.length === 0) return baselines;
  try {
    for (let offset = 0; offset < boothIds.length; offset += 100) {
      const query = client
        .from("orders")
        .select("booth_id, order_number")
        .in("booth_id", boothIds.slice(offset, offset + 100))
        .gte("created_at", sgtStartOfDayIso())
        .order("order_number", { ascending: true })
        .order("id");
      const todaysOrders = await readAllRows((from, to) =>
        query.range(from, to),
      );
      for (const o of todaysOrders) {
        if (!(o.booth_id in baselines) && o.order_number != null) {
          baselines[o.booth_id] = o.order_number;
        }
      }
    }
  } catch {
    console.error("daily-baseline read failed");
    return {};
  }
  return baselines;
}

/**
 * The number staff and the customer see for this order: the day's rank when
 * the vendor has board_settings.daily_order_number_reset on, the permanent
 * order_number otherwise. Anything that names an order to the vendor from
 * the server has to go through this, or it names a number nobody is looking
 * at.
 */
export async function vendorFacingOrderNumber(
  client: Client,
  vendorId: string,
  boothId: string,
  orderNumber: string,
): Promise<string> {
  const { data: vendor } = await client
    .from("vendors")
    .select("board_settings")
    .eq("id", vendorId)
    .maybeSingle();
  const settings = boardSettingsSchema.safeParse(vendor?.board_settings);
  if (!settings.success || !settings.data.daily_order_number_reset)
    return orderNumber;

  return displayOrderNumber(
    orderNumber,
    await firstOrderNumberToday(client, boothId),
  );
}
