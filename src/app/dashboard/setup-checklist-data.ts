import type { createServerClient } from "@/lib/supabase/server";
import { parseMenuItems } from "@/lib/schemas";
import { expectsPayment, paymentKindOf } from "@/lib/payment-marker";
import type { ChecklistBooth } from "@/lib/setup-checklist";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

interface BoothRow {
  id: string;
  menu_items: unknown;
  payment: unknown;
}

/** The earliest booth's setup facts, as plain props for the client checklist. */
export function checklistBoothOf(
  first: BoothRow | undefined,
  view: { open: boolean } | undefined,
): ChecklistBooth | null {
  if (!first || !view) return null;
  return {
    id: first.id,
    menuItemCount: parseMenuItems(first.menu_items).length,
    hasPayment: expectsPayment(paymentKindOf(first.payment)),
    open: view.open,
  };
}

/**
 * Whether the vendor has any order, finished ones included: someone with
 * orders is past setup and must not be nagged. The board's own read only sees
 * unfinished orders, so a quiet booth falls back to a one-row existence check.
 */
export async function vendorHasOrders(
  supabase: Supabase,
  boothIds: string[],
  boardHasOrders: boolean,
  ordersFailed: boolean,
): Promise<boolean> {
  if (boardHasOrders) return true;
  if (ordersFailed || boothIds.length === 0) return false;
  const { data } = await supabase
    .from("orders")
    .select("id")
    .in("booth_id", boothIds.slice(0, 100))
    .limit(1);
  return (data?.length ?? 0) > 0;
}
