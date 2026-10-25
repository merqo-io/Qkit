import { createServerClient } from "@/lib/supabase/server";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { BOARD_ORDER_COLUMNS } from "@/lib/orders";
import { sgtStartOfDayIso } from "@/lib/tz";
import { firstOrderNumbersToday } from "@/lib/daily-order-number";
import { CompletedOrdersList } from "./completed-orders-list";
import type { BoardOrder } from "@/lib/types";
import { PageHeader } from "@/components/widgets/page-header";

export const revalidate = 0;

const HISTORY_LIMIT = 500;

export default async function CompletedOrdersPage() {
  const { vendor } = await requireEntitledVendor();
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
  if (boothIds.length) {
    const { data, error } = await supabase
      .from("orders")
      .select(BOARD_ORDER_COLUMNS)
      .in("booth_id", boothIds)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    ordersErr = error;
    if (error) console.error("completed orders read failed", error.message);
    orders = (data ?? []).filter(
      (o) => o.order_number !== null && o.order_number !== undefined,
    );
  }

  const loadError = Boolean(boothErr) || Boolean(ordersErr);

  const dailyOrderNumberBaselines = vendor.board_settings
    .daily_order_number_reset
    ? await firstOrderNumbersToday(supabase, boothIds)
    : {};

  return (
    <div>
      <header className="mb-7">
        <PageHeader eyebrow="Order history" title="Completed orders" />
      </header>
      <CompletedOrdersList
        booths={booths ?? []}
        orders={orders}
        loadError={loadError}
        historyLimit={HISTORY_LIMIT}
        todayStartIso={sgtStartOfDayIso()}
        dailyOrderNumberBaselines={dailyOrderNumberBaselines}
      />
    </div>
  );
}
