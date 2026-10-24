import type { CartItem, MenuItem, SelectedOption } from "@/lib/types";
import { cartKey, sumOptionDeltas } from "@/lib/cart";
import { remainingFor, type Remaining } from "@/lib/stock";
import { isNil } from "@/lib/utils";

// One line of a past order, as needed to rebuild a cart. Carries no price/name —
// those are re-read from the live menu so a reorder always reflects current
// prices and availability (the snapshot can be stale).
export type ReorderLine = {
  menuItemId: string;
  quantity: number;
  options?: SelectedOption[];
};

export type ReorderResult = {
  // Reconciled cart lines, rebuilt against the current menu (current name/price),
  // duplicates merged by cart key.
  items: CartItem[];
  // Source lines that could not be added (item removed, an option no longer
  // exists, or no stock left).
  unavailable: number;
};

// SelectedOption stores LABELS (see item-customizer), so validate a line's
// options against the item's current option_groups by label. A renamed group or
// choice fails the match — the line is treated as unavailable (best-effort).
function optionsStillValid(
  options: SelectedOption[] | undefined,
  item: MenuItem,
): boolean {
  if (!options || options.length === 0) return true;
  const groups = item.option_groups ?? [];
  return options.every((o) => {
    const group = groups.find((g) => g.label === o.group);
    return !!group && group.choices.some((c) => c.label === o.choice);
  });
}

function currentPrice(item: MenuItem, options: SelectedOption[] | undefined) {
  const delta = sumOptionDeltas(item, options);
  return isNil(item.price_cents) && delta === 0
    ? undefined
    : (item.price_cents ?? 0) + delta;
}

/** Restore current prices/options, drop unavailable items, and cap shared stock. */
export function reconcileReorder(
  lines: ReorderLine[],
  menuItems: MenuItem[],
  remaining: Remaining = {},
): ReorderResult {
  const byKey = new Map<string, CartItem>();
  const usedByItem = new Map<string, number>();
  let unavailable = 0;

  for (const line of lines) {
    const qty = Number.isFinite(line.quantity) ? Math.floor(line.quantity) : 0;
    const item = menuItems.find((m) => m.id === line.menuItemId);
    // Skip lines whose item is gone, currently turned off (`available: false`),
    // has a non-positive quantity, or whose options no longer exist.
    if (
      !item ||
      !item.available ||
      qty <= 0 ||
      !optionsStillValid(line.options, item)
    ) {
      unavailable++;
      continue;
    }

    // Clamp to remaining stock, accounting for quantity already taken by earlier
    // lines of the same item.
    const left = remainingFor(remaining, item.id);
    let take = qty;
    if (left !== null) {
      const room = Math.max(0, left - (usedByItem.get(item.id) ?? 0));
      take = Math.min(qty, room);
    }
    if (take <= 0) {
      unavailable++;
      continue;
    }
    usedByItem.set(item.id, (usedByItem.get(item.id) ?? 0) + take);

    const options =
      line.options && line.options.length ? line.options : undefined;
    const key = cartKey(item.id, options);
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += take;
    } else {
      byKey.set(key, {
        menuItemId: item.id,
        name: item.name,
        price_cents: currentPrice(item, options),
        options,
        quantity: take,
      });
    }
  }

  return { items: [...byKey.values()], unavailable };
}
