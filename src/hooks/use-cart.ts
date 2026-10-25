import { useState } from "react";
import { cartKey, sumOptionDeltas } from "@/lib/cart";
import type { CartItem, MenuItem, SelectedOption } from "@/lib/types";
import { isNil } from "@/lib/utils";

type CartMap = Map<string, CartItem>;

/**
 * The basket both order forms build: the customer's page and the staff
 * walk-up dialog. Holds the lines, keyed by item plus chosen options (see
 * `cartKey`), and the three ways a line changes.
 *
 * It knows nothing about stock or limits. Whether one more may be added is
 * the caller's question, asked before calling `add` or `increment`: the two
 * forms decide it differently (availability net of other baskets' holds on
 * the customer page, plain remaining stock at the counter) and explain a
 * refusal in different words.
 *
 * `setCart` stays exposed for the cases that replace the basket wholesale:
 * restoring a saved one, trimming it when stock is taken, clearing it.
 */
export function useCart() {
  const [cart, setCart] = useState<CartMap>(new Map());

  // The updater gets the current line (or undefined) and returns the line to
  // store, null to remove it, or undefined to leave the basket untouched
  // (same Map, so no re-render).
  function update(
    key: string,
    fn: (existing: CartItem | undefined) => CartItem | null | undefined,
  ) {
    setCart((prev) => {
      const result = fn(prev.get(key));
      if (result === undefined) return prev;
      const next = new Map(prev);
      if (result === null) next.delete(key);
      else next.set(key, result);
      return next;
    });
  }

  /** Adds one of this item with these options, as a new line or one more. */
  function add(item: MenuItem, options: SelectedOption[]) {
    // The line's price folds in the chosen options' deltas. Display only: the
    // order RPCs re-derive every price from the stored menu. An unpriced item
    // whose options add nothing stays unpriced, so it still reads "Free".
    const delta = sumOptionDeltas(item, options);
    const combined = (item.price_cents ?? 0) + delta;
    const price_cents =
      isNil(item.price_cents) && delta === 0 ? undefined : combined;
    update(cartKey(item.id, options), (existing) => ({
      menuItemId: item.id,
      name: item.name,
      price_cents,
      options: options.length ? options : undefined,
      quantity: existing ? existing.quantity + 1 : 1,
    }));
  }

  /** One more of an existing line. A key not in the basket is ignored. */
  function increment(key: string) {
    update(key, (existing) =>
      existing ? { ...existing, quantity: existing.quantity + 1 } : undefined,
    );
  }

  /** One fewer of a line; the last one removes it. */
  function decrement(key: string) {
    update(key, (existing) => {
      if (!existing) return undefined;
      return existing.quantity <= 1
        ? null
        : { ...existing, quantity: existing.quantity - 1 };
    });
  }

  return {
    cart,
    setCart,
    entries: Array.from(cart.entries()),
    items: Array.from(cart.values()),
    add,
    increment,
    decrement,
  };
}
