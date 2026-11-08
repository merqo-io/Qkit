import { count } from "@/lib/utils";
import type { Availability } from "@/lib/availability";

// Below this many items left, the menu says how many. Above it the number is
// noise: nobody queues differently at 40 remaining.
const LOW_STOCK_ITEMS = 10;

// Low-stock counts include unsold items in other baskets; holds are advisory.
function StockNotice({
  left,
  leftHeld,
}: {
  left: number | null;
  leftHeld: number;
}) {
  if (left === null || left > LOW_STOCK_ITEMS) return null;
  if (left > 0)
    return (
      <div className="rounded-xl border border-status-aging/40 bg-status-aging/10 px-4 py-3 text-center">
        <p className="text-sm font-semibold">Only {count(left, "item")} left</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {leftHeld > 0
            ? "Other baskets also contain these items. Stock is checked when you order."
            : "Once they're gone, this stall stops taking orders."}
        </p>
      </div>
    );
  return null;
}

// Limits that apply to the whole basket, said once above the menu so nobody
// finds them out from a refused tap.
export function BasketLimits({ availability }: { availability: Availability }) {
  const { left, leftHeld, maxPerOrder } = availability;
  const stock =
    left !== null && left <= LOW_STOCK_ITEMS && (left > 0 || leftHeld > 0);
  if (!stock && maxPerOrder === null) return null;
  return (
    <div className="mx-auto max-w-lg space-y-2">
      <StockNotice left={left} leftHeld={leftHeld} />
      {maxPerOrder !== null && (
        <p className="text-center text-sm text-muted-foreground">
          Up to {count(maxPerOrder, "item")} per order at this stall.
        </p>
      )}
    </div>
  );
}
