import type { createServiceClient } from "@/lib/supabase/server";
import { displayOrderNumber } from "@/lib/orders";
import { boardSettingsSchema } from "@/lib/schemas";
import { readAllRows } from "@/lib/supabase/read-all";
import { sgtStartOfDayIso } from "@/lib/tz";

type Client = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * When a booth's daily numbering last restarted: the later of the SGT day
 * start and its "Start new service" stamp (booths.cap_reset_at).
 */
export function numberingStartIso(capResetAt: string | null | undefined) {
  const dayStart = sgtStartOfDayIso();
  if (!capResetAt || Number.isNaN(Date.parse(capResetAt))) return dayStart;
  return Date.parse(capResetAt) > Date.parse(dayStart)
    ? new Date(capResetAt).toISOString()
    : dayStart;
}

/**
 * The booth's first order_number since its numbering last restarted (SGT
 * midnight or Start new service), or null when it has had no order since.
 * This is the baseline `displayOrderNumber` ranks against when a vendor has
 * daily numbering on. Orders placed before a mid-day restart rank at or below
 * zero against it, so they keep their permanent number.
 *
 * Shared by every server path that shows a ticket number for a
 * single booth (the customer's status page, the TV display, the printed
 * label, the Telegram alert), so they cannot drift apart. The order board
 * reads many booths at once through the batched helper below.
 */
export async function firstOrderNumberToday(
  client: Client,
  boothId: string,
): Promise<string | null> {
  const { data: booth } = await client
    .from("booths")
    .select("cap_reset_at")
    .eq("id", boothId)
    .maybeSingle();
  const { data } = await client
    .from("orders")
    .select("order_number")
    .eq("booth_id", boothId)
    .gte("created_at", numberingStartIso(booth?.cap_reset_at))
    .order("order_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  const first = data?.order_number ?? null;
  // Text order stops matching numeric order when the lifetime counter grows.
  if (first === null || first.length <= 4) return first;
  return (await firstOrderNumbersToday(client, [boothId]))[boothId] ?? null;
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
      const chunk = boothIds.slice(offset, offset + 100);
      const { data: boothRows, error: boothError } = await client
        .from("booths")
        .select("id, cap_reset_at")
        .in("id", chunk);
      if (boothError) throw boothError;
      const starts = new Map(
        (boothRows ?? []).map((b) => [
          b.id,
          Date.parse(numberingStartIso(b.cap_reset_at)),
        ]),
      );
      const dayStartMs = Date.parse(sgtStartOfDayIso());
      const query = client
        .from("orders")
        .select("booth_id, order_number, created_at")
        .in("booth_id", chunk)
        .gte("created_at", sgtStartOfDayIso())
        .order("order_number", { ascending: true })
        .order("id");
      const todaysOrders = await readAllRows((from, to) =>
        query.range(from, to),
      );
      for (const o of todaysOrders) {
        if (
          Date.parse(o.created_at) >= (starts.get(o.booth_id) ?? dayStartMs) &&
          o.order_number !== null &&
          o.order_number !== undefined &&
          (!(o.booth_id in baselines) ||
            Number(o.order_number) < Number(baselines[o.booth_id]))
        ) {
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
