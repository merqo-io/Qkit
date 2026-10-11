import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { parseBoothHours, parseMenuItems } from "@/lib/schemas";
import { buildOptionCodes, type OptionCodes } from "@/lib/ticket";
import { isBoothOpen } from "@/lib/hours";
import { BOARD_ORDER_COLUMNS } from "@/lib/orders";
import { readAllRows } from "@/lib/supabase/read-all";
import { readKeysetRows } from "@/lib/supabase/read-keyset";
import { sgtStartOfDayIso } from "@/lib/tz";
import { RealtimeOrderBoard } from "./realtime-order-board";
import type { BoardOrder } from "@/lib/types";

export const revalidate = 0;

/** Decorative cup counts; the database trigger enforces the actual capacity. */
async function loadCupsToday(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  boothIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (let offset = 0; offset < boothIds.length; offset += 8) {
    const results = await Promise.allSettled(
      boothIds.slice(offset, offset + 8).map(async (id) => {
        const { data, error } = await supabase.rpc("booth_cups_today", {
          p_booth_id: id,
        });
        if (error) {
          console.error("dashboard booth_cups_today failed", error.message);
          return null;
        }
        return typeof data === "number" ? ([id, data] as const) : null;
      }),
    );
    for (const row of results) {
      if (row.status === "fulfilled" && row.value)
        counts[row.value[0]] = row.value[1];
      else if (row.status === "rejected")
        console.error("dashboard booth_cups_today request failed");
    }
  }
  return counts;
}

/** First numbered order per booth today; skipped when daily numbering is off. */
async function loadDailyOrderNumberBaselines(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  boothIds: string[],
): Promise<Record<string, string>> {
  const baselines: Record<string, string> = {};
  if (boothIds.length === 0) return baselines;
  try {
    for (let offset = 0; offset < boothIds.length; offset += 100) {
      const query = supabase
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
    // Non-critical/decorative — degrade to showing the real order_number
    // (displayOrderNumber's own null-baseline fallback) rather than fail the
    // whole board over it.
    console.error("dashboard daily-baseline read failed");
    return {};
  }
  return baselines;
}

export default async function DashboardPage() {
  // Reuse the entitlement cache the layout already primed (same React.cache),
  // so this doesn't add a second vendor-row round-trip via getVendor.
  const { vendor } = await requireEntitledVendor();

  const supabase = await createServerClient();

  const boothQuery = supabase
    .from("booths")
    .select(
      "id, name, is_active, hours, walkup_default, daily_cup_cap, menu_items, requires_arrival_confirm",
    )
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: true })
    .order("id");
  const { booths, boothErr } = await readAllRows((from, to) =>
    boothQuery.range(from, to),
  )
    .then((rows) => ({ booths: rows, boothErr: false }))
    .catch(() => {
      console.error("dashboard booths read failed");
      return { booths: [], boothErr: true };
    });

  const boothIds = (booths ?? []).map((b) => b.id);
  const cupsToday = await loadCupsToday(
    supabase,
    (booths ?? []).filter((b) => b.daily_cup_cap != null).map((b) => b.id),
  );

  // Open/closed as of this request (SGT); revalidate=0 re-evaluates on nav.
  const nowIso = new Date().toISOString();
  // Each booth's short codes for option choices, read out of its menu here so
  // the board gets a small lookup rather than every menu, photos and all.
  const optionCodes: Record<string, OptionCodes> = {};
  for (const b of booths ?? []) {
    const codes = buildOptionCodes(parseMenuItems(b.menu_items));
    if (Object.keys(codes).length > 0) optionCodes[b.id] = codes;
  }

  const boothViews = (booths ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    is_active: b.is_active,
    open: isBoothOpen(
      { is_active: b.is_active, hours: parseBoothHours(b.hours) },
      nowIso,
    ),
    walkup_default: b.walkup_default,
    requires_arrival_confirm: b.requires_arrival_confirm,
    daily_cup_cap: b.daily_cup_cap,
    cups_today: cupsToday[b.id] ?? 0,
  }));

  let orders: BoardOrder[] = [];
  let ordersErr = null;
  if (boothIds.length) {
    try {
      const completeOrders: BoardOrder[] = [];
      for (let offset = 0; offset < boothIds.length; offset += 100) {
        const query = supabase
          .from("orders")
          .select(BOARD_ORDER_COLUMNS)
          .in("booth_id", boothIds.slice(offset, offset + 100))
          .not("status", "in", "(completed,cancelled)")
          .order("id");
        completeOrders.push(
          ...(
            await readKeysetRows((afterId) => {
              if (afterId !== null) query.gt("id", afterId);
              return query.limit(1000);
            })
          ).filter((o) => o.order_number != null),
        );
      }
      orders = completeOrders;
    } catch {
      ordersErr = true;
      console.error("dashboard orders read failed");
    }
  }

  // A read error must not masquerade as an empty board — a vendor could think
  // the queue is clear when it isn't. Surface a retry banner instead.
  const loadError = Boolean(boothErr) || Boolean(ordersErr);

  const dailyOrderNumberBaselines = vendor.board_settings
    .daily_order_number_reset
    ? await loadDailyOrderNumberBaselines(supabase, boothIds)
    : {};

  return (
    <RealtimeOrderBoard
      booths={boothViews}
      initialOrders={orders}
      boardSettings={vendor.board_settings}
      loadError={loadError}
      dailyOrderNumberBaselines={dailyOrderNumberBaselines}
      optionCodes={optionCodes}
    />
  );
}
