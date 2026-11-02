import type { createServiceClient } from "@/lib/supabase/server";
import {
  baselineFor,
  type NumberingBaselines,
} from "@/lib/numbering-baselines";
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
 * The booth's two display-number baselines (see NumberingBaselines): its first
 * order_number since SGT midnight and its first since the latest "Start new
 * service". `baselineFor` picks between them by an order's created_at, so an
 * order still open across a restart keeps the number it showed. Returns null
 * only when the booth cannot be read; a booth with no orders yet gets null
 * baselines, and every order then shows its permanent number.
 *
 * Exact for one restart in a day. After several, orders from services before
 * the latest one rank from SGT midnight instead of their own restart; a log of
 * restarts would be needed to be exact.
 *
 * Shared by every server path that shows a ticket number for a
 * single booth (the customer's status page, the TV display, the printed
 * label, the Telegram alert), so they cannot drift apart. The order board
 * reads many booths at once through the batched helper below.
 */
export async function numberingBaselines(
  client: Client,
  boothId: string,
): Promise<NumberingBaselines | null> {
  const { data: booth, error: boothError } = await client
    .from("booths")
    .select("cap_reset_at")
    .eq("id", boothId)
    .maybeSingle();
  if (boothError) {
    console.error("daily-baseline booth read failed", boothError.message);
    return null;
  }
  const dayStart = sgtStartOfDayIso();
  const serviceStart = numberingStartIso(booth?.cap_reset_at);
  const firstSince = async (since: string): Promise<string | null> => {
    const { data } = await client
      .from("orders")
      .select("order_number")
      .eq("booth_id", boothId)
      .gte("created_at", since)
      .order("order_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.order_number ?? null;
  };
  const day = await firstSince(dayStart);
  const service =
    serviceStart === dayStart ? day : await firstSince(serviceStart);
  // Text order stops matching numeric order when the lifetime counter grows.
  if ((day?.length ?? 0) > 4 || (service?.length ?? 0) > 4) {
    return (
      (await numberingBaselinesByBooth(client, [boothId]))[boothId] ?? {
        day: null,
        service: null,
        serviceStart,
      }
    );
  }
  return { day, service, serviceStart };
}

/**
 * numberingBaselines for many booths at once, keyed by booth id: the
 * vendor's order board and their Completed page. A booth with no numbered
 * order yet today has no key. A failed read returns nothing, so tickets fall
 * back to their permanent numbers instead of the page failing over a number.
 */
export async function numberingBaselinesByBooth(
  client: Client,
  boothIds: string[],
): Promise<Record<string, NumberingBaselines>> {
  const baselines: Record<string, NumberingBaselines> = {};
  if (boothIds.length === 0) return baselines;
  const lower = (current: string | null, candidate: string) =>
    current === null || Number(candidate) < Number(current)
      ? candidate
      : current;
  try {
    for (let offset = 0; offset < boothIds.length; offset += 100) {
      const chunk = boothIds.slice(offset, offset + 100);
      const { data: boothRows, error: boothError } = await client
        .from("booths")
        .select("id, cap_reset_at")
        .in("id", chunk);
      if (boothError) throw boothError;
      const serviceStarts = new Map(
        (boothRows ?? []).map((b) => [b.id, numberingStartIso(b.cap_reset_at)]),
      );
      const dayStart = sgtStartOfDayIso();
      const query = client
        .from("orders")
        .select("booth_id, order_number, created_at")
        .in("booth_id", chunk)
        .gte("created_at", dayStart)
        .order("order_number", { ascending: true })
        .order("id");
      const todaysOrders = await readAllRows((from, to) =>
        query.range(from, to),
      );
      for (const o of todaysOrders) {
        if (o.order_number === null || o.order_number === undefined) continue;
        const serviceStart = serviceStarts.get(o.booth_id) ?? dayStart;
        const entry = (baselines[o.booth_id] ??= {
          day: null,
          service: null,
          serviceStart,
        });
        entry.day = lower(entry.day, o.order_number);
        if (Date.parse(o.created_at) >= Date.parse(serviceStart))
          entry.service = lower(entry.service, o.order_number);
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
 *
 * Pass `createdAt` when the caller already has the order row; otherwise it is
 * read here. Any failure to read it shows the permanent number.
 */
export async function vendorFacingOrderNumber(
  client: Client,
  vendorId: string,
  boothId: string,
  order: { orderNumber: string; createdAt?: string | null },
): Promise<string> {
  const { orderNumber, createdAt } = order;
  const { data: vendor } = await client
    .from("vendors")
    .select("board_settings")
    .eq("id", vendorId)
    .maybeSingle();
  const settings = boardSettingsSchema.safeParse(vendor?.board_settings);
  if (!settings.success || !settings.data.daily_order_number_reset)
    return orderNumber;

  try {
    let placedAt = createdAt;
    if (!placedAt) {
      const { data: order } = await client
        .from("orders")
        .select("created_at")
        .eq("booth_id", boothId)
        .eq("order_number", orderNumber)
        .maybeSingle();
      placedAt = order?.created_at;
    }
    return displayOrderNumber(
      orderNumber,
      baselineFor(placedAt, await numberingBaselines(client, boothId)),
    );
  } catch {
    console.error("vendor-facing order number read failed");
    return orderNumber;
  }
}
