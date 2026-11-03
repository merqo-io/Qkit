import { createServiceClient } from "@/lib/supabase/server";
import {
  accumulateBaseline,
  baselineFor,
  emptyServices,
  type NumberingBaselines,
} from "@/lib/numbering-baselines";
import { displayOrderNumber } from "@/lib/orders";
import { boardSettingsSchema } from "@/lib/schemas";
import { readAllRows } from "@/lib/supabase/read-all";
import { sgtStartOfDayIso } from "@/lib/tz";

type Client = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * Today's "Start new service" times per booth, ascending. Read from the
 * booth_service_starts log (migration 0110), plus booths.cap_reset_at when it
 * falls today, so a database without that table yet still restarts numbering
 * at the latest start. Throws only when the booths cannot be read.
 */
export async function serviceStartsByBooth(
  client: Client,
  boothIds: string[],
): Promise<Record<string, string[]>> {
  const starts: Record<string, Set<string>> = {};
  const dayStart = sgtStartOfDayIso();
  const add = (boothId: string, iso: string | null | undefined) => {
    if (!iso || Number.isNaN(Date.parse(iso))) return;
    if (Date.parse(iso) < Date.parse(dayStart)) return;
    const set = starts[boothId] ?? new Set<string>();
    set.add(new Date(iso).toISOString());
    starts[boothId] = set;
  };
  for (let offset = 0; offset < boothIds.length; offset += 100) {
    const chunk = boothIds.slice(offset, offset + 100);
    const { data: boothRows, error: boothError } = await client
      .from("booths")
      .select("id, cap_reset_at")
      .in("id", chunk);
    if (boothError) throw boothError;
    for (const b of boothRows ?? []) add(b.id, b.cap_reset_at);
    const { data: logRows, error: logError } = await client
      .from("booth_service_starts")
      .select("booth_id, started_at")
      .in("booth_id", chunk)
      .gte("started_at", dayStart);
    if (logError) {
      console.error(
        "service-start log read failed, numbering falls back to the latest restart only",
        { boothIds: chunk, code: logError.code, message: logError.message },
      );
      continue;
    }
    for (const r of logRows ?? []) add(r.booth_id, r.started_at);
  }
  return Object.fromEntries(
    Object.entries(starts).map(([id, set]) => [id, [...set].sort()]),
  );
}

type NumberingState = {
  baselines: Record<string, NumberingBaselines>;
  starts: Record<string, string[]>;
};

async function readBaselines(
  client: Client,
  boothIds: string[],
): Promise<NumberingState> {
  const baselines: Record<string, NumberingBaselines> = {};
  if (boothIds.length === 0) return { baselines, starts: {} };
  const startsByBooth = await serviceStartsByBooth(client, boothIds);
  const dayStart = sgtStartOfDayIso();
  for (let offset = 0; offset < boothIds.length; offset += 100) {
    const chunk = boothIds.slice(offset, offset + 100);
    const query = client
      .from("orders")
      .select("booth_id, order_number, created_at")
      .in("booth_id", chunk)
      .gte("created_at", dayStart)
      .order("order_number", { ascending: true })
      .order("id");
    const todaysOrders = await readAllRows((from, to) => query.range(from, to));
    for (const o of todaysOrders) {
      if (o.order_number === null || o.order_number === undefined) continue;
      const entry = (baselines[o.booth_id] ??= {
        day: null,
        services: emptyServices(startsByBooth[o.booth_id] ?? []),
      });
      accumulateBaseline(entry, o.order_number, o.created_at);
    }
  }
  return { baselines, starts: startsByBooth };
}

/**
 * The board's numbering inputs in one read: baselines (as
 * numberingBaselinesByBooth) and today's restart times per booth, which a booth
 * with no order yet has only here. A failed read returns both empty.
 */
export async function numberingStateByBooth(
  client: Client,
  boothIds: string[],
): Promise<NumberingState> {
  try {
    return await readBaselines(client, boothIds);
  } catch (error) {
    console.error(
      "daily-baseline read failed",
      error instanceof Error
        ? error.message
        : (error as { message?: string } | null)?.message,
    );
    return { baselines: {}, starts: {} };
  }
}

/**
 * numberingStateByBooth through the service client, for the vendor dashboard.
 * The caller passes booth ids it already read under RLS, so only the vendor's
 * own booths are read; the user-session read of booth_service_starts did not
 * return its rows on prod, which left the board ranking from the latest
 * restart only.
 */
export async function numberingStateForOwnBooths(
  ownBoothIds: string[],
): Promise<NumberingState> {
  return numberingStateByBooth(await createServiceClient(), ownBoothIds);
}

/**
 * The booth's display-number baselines (see NumberingBaselines): its first
 * order_number since SGT midnight and since each "Start new service" today.
 * `baselineFor` picks one by an order's created_at, so an order keeps the
 * number it showed however many restarts follow it. Returns null only when
 * the booth cannot be read; a booth with no orders yet gets null baselines,
 * and every order then shows its permanent number.
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
  try {
    const { baselines, starts } = await readBaselines(client, [boothId]);
    return (
      baselines[boothId] ?? {
        day: null,
        services: emptyServices(starts[boothId] ?? []),
      }
    );
  } catch {
    console.error("daily-baseline read failed");
    return null;
  }
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
  return (await numberingStateByBooth(client, boothIds)).baselines;
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
