import { z } from "zod";
import type { CartItem } from "@/lib/types";
import { parseRemaining, remainingFor, type Remaining } from "@/lib/stock";

/**
 * What a customer can still add to a basket at a booth, as the order page
 * shows it. Postgres computes it (booth_availability, migration 0096) net of
 * what other customers' baskets are holding; this module parses that result
 * and applies it to a cart. It is display and courtesy only: place_order and
 * the cap triggers are the real limits.
 */
export type Availability = {
  // Per capped item: how many this customer can still take. Absent = unlimited.
  remaining: Remaining;
  // Per capped item: how many of the stock other baskets are holding.
  held: Remaining;
  // Items left in the booth's daily total, or null when it has none.
  left: number | null;
  // How many of the daily total other baskets are holding.
  leftHeld: number;
  // Most items one order may carry, or null when the booth sets no limit.
  maxPerOrder: number | null;
};

export const NO_LIMITS: Availability = {
  remaining: {},
  held: {},
  left: null,
  leftHeld: 0,
  maxPerOrder: null,
};

const wholeNumber = z.number().int().nonnegative();

const availabilityShape = z.object({
  remaining: z.unknown(),
  held: z.unknown(),
  left: wholeNumber.nullable(),
  left_held: wholeNumber,
  max_per_order: z.number().int().positive().nullable(),
});

/** Coerce the booth_availability JSONB result; null when it is not that. */
export function parseAvailability(data: unknown): Availability | null {
  const parsed = availabilityShape.safeParse(data);
  if (!parsed.success) return null;
  return {
    remaining: parseRemaining(parsed.data.remaining),
    held: parseRemaining(parsed.data.held),
    left: parsed.data.left,
    leftHeld: parsed.data.left_held,
    maxPerOrder: parsed.data.max_per_order,
  };
}

/** True when the booth limits anything a basket could run into. */
export function hasLimits(a: Availability): boolean {
  return (
    a.left !== null || a.maxPerOrder !== null || hasStockLimits(a.remaining)
  );
}

/** True when a hold is worth placing: stock is finite somewhere. */
export function holdsApply(a: Availability): boolean {
  return a.left !== null || hasStockLimits(a.remaining);
}

function hasStockLimits(remaining: Remaining): boolean {
  return Object.keys(remaining).length > 0;
}

function quantityOf(items: CartItem[], menuItemId?: string): number {
  let n = 0;
  for (const it of items) {
    if (menuItemId === undefined || it.menuItemId === menuItemId)
      n += it.quantity;
  }
  return n;
}

export type AddBlock =
  | { kind: "sold_out" }
  | { kind: "item_held" }
  | { kind: "item_left"; left: number }
  | { kind: "booth_sold_out" }
  | { kind: "booth_held" }
  | { kind: "booth_left"; left: number }
  | { kind: "order_limit"; max: number };

function itemBlock(
  items: CartItem[],
  menuItemId: string,
  a: Availability,
): AddBlock | null {
  const left = remainingFor(a.remaining, menuItemId);
  if (left === null || quantityOf(items, menuItemId) < left) return null;
  if (left > 0) return { kind: "item_left", left };
  return (a.held[menuItemId] ?? 0) > 0
    ? { kind: "item_held" }
    : { kind: "sold_out" };
}

function boothBlock(total: number, a: Availability): AddBlock | null {
  if (a.left === null || total < a.left) return null;
  if (a.left > 0) return { kind: "booth_left", left: a.left };
  return a.leftHeld > 0 ? { kind: "booth_held" } : { kind: "booth_sold_out" };
}

/**
 * Why one more of an item cannot go into the basket, or null when it can.
 * Most specific first: the item's own stock, then the booth's daily total,
 * then the per-order limit.
 */
export function addBlock(
  items: CartItem[],
  menuItemId: string,
  a: Availability,
): AddBlock | null {
  const total = quantityOf(items);
  const stock = itemBlock(items, menuItemId, a) ?? boothBlock(total, a);
  if (stock) return stock;
  if (a.maxPerOrder !== null && total >= a.maxPerOrder)
    return { kind: "order_limit", max: a.maxPerOrder };
  return null;
}

const plural = (n: number) => (n === 1 ? "item" : "items");

/** Customer-facing sentence for an AddBlock. */
export function addBlockMessage(block: AddBlock): string {
  switch (block.kind) {
    case "sold_out":
      return "Sold out";
    case "item_held":
      return "The last ones are in someone else's basket. Try again in a few minutes.";
    case "item_left":
      return `Only ${block.left} left`;
    case "booth_sold_out":
      return "This stall has sold out.";
    case "booth_held":
      return "The last items are in other baskets. Try again in a few minutes.";
    case "booth_left":
      return `This stall has only ${block.left} ${plural(block.left)} left.`;
    case "order_limit":
      return `This stall takes up to ${block.max} ${plural(block.max)} per order.`;
  }
}

/**
 * Cut a basket down to what is available, keeping lines in order and trimming
 * from the end, so what the customer added first survives. `trimmed` is how
 * many units were taken out.
 */
export function fitCart(
  items: CartItem[],
  a: Availability,
): { items: CartItem[]; trimmed: number } {
  let budget = Math.min(a.left ?? Infinity, a.maxPerOrder ?? Infinity);
  const usedByItem = new Map<string, number>();
  const kept: CartItem[] = [];
  let trimmed = 0;

  for (const it of items) {
    const used = usedByItem.get(it.menuItemId) ?? 0;
    const left = remainingFor(a.remaining, it.menuItemId);
    const room = left === null ? Infinity : Math.max(0, left - used);
    const take = Math.max(0, Math.min(it.quantity, room, budget));
    trimmed += it.quantity - take;
    if (take === 0) continue;
    usedByItem.set(it.menuItemId, used + take);
    budget -= take;
    kept.push(take === it.quantity ? it : { ...it, quantity: take });
  }

  return { items: trimmed === 0 ? items : kept, trimmed };
}
