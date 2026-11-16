import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { BOARD_ORDER_COLUMNS } from "@/lib/orders";
import { sgtStartOfDayIso, sgtYesterdayStartIso } from "@/lib/tz";
import { numberingStateForOwnBooths } from "@/lib/own-booth-numbering";
import { NumbersDegradedBanner } from "../board-sections";
import { CompletedOrdersList } from "./completed-orders-list";
import type { BoardOrder } from "@/lib/types";
import { PageHeader } from "@merqo/ui";

export const revalidate = 0;

const HISTORY_LIMIT = 500;

async function hasOlderCompleted(boothIds: string[], beforeIso: string) {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("orders")
    .select("id")
    .in("booth_id", boothIds)
    .eq("status", "completed")
    .lt("completed_at", beforeIso)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export default async function CompletedOrdersPage() {
  const { vendor, entitlement } = await requireEntitledVendor();
  const windowStartIso =
    entitlement.statsRanges.length > 1 ? null : sgtYesterdayStartIso();
  const supabase = await createServerClient();

  const { data: booths, error: boothErr } = await supabase
    .from("booths")
    .select("id, name")
    .eq("vendor_id", vendor.id)
    .order("created_at", { ascending: true });
  if (boothErr)
    console.error("completed orders booths read failed", boothErr.message);

  const boothIds = (booths ?? []).map((b) => b.id);

  let orders: BoardOrder[] = [];
  let ordersErr = null;
  let olderHidden = false;
  if (boothIds.length) {
    let query = supabase
      .from("orders")
      .select(BOARD_ORDER_COLUMNS)
      .in("booth_id", boothIds)
      .eq("status", "completed");
    if (windowStartIso) query = query.gte("completed_at", windowStartIso);
    const { data, error } = await query
      .order("completed_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    ordersErr = error;
    if (error) console.error("completed orders read failed", error.message);
    if (windowStartIso && !error) {
      olderHidden = await hasOlderCompleted(boothIds, windowStartIso);
    }
    orders = (data ?? []).filter(
      (o) => o.order_number !== null && o.order_number !== undefined,
    );
  }

  const loadError = Boolean(boothErr) || Boolean(ordersErr);

  // boothIds come from the RLS-scoped booths read above; the service client
  // matches the customer status page so both rank from the same restart log.
  const { baselines: dailyOrderNumberBaselines, degraded: numbersDegraded } =
    vendor.board_settings.daily_order_number_reset
      ? await numberingStateForOwnBooths(boothIds)
      : { baselines: {}, degraded: undefined };

  return (
    <div>
      <PageHeader eyebrow="Order history" title="Completed orders" />
      {numbersDegraded && <NumbersDegradedBanner />}
      <CompletedOrdersList
        booths={booths ?? []}
        orders={orders}
        loadError={loadError}
        historyLimit={HISTORY_LIMIT}
        olderHidden={olderHidden}
        todayStartIso={sgtStartOfDayIso()}
        dailyOrderNumberBaselines={dailyOrderNumberBaselines}
      />
    </div>
  );
}
