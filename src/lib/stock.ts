/**
 * Sold-out / stock-cap helpers. The authoritative remaining counts are computed
 * in Postgres (booth_remaining_stock, which counts sales in the current service:
 * since SGT midnight or the last "Start new service", like the daily item limit)
 * and re-enforced inside place_order; this
 * module parses that result and reports the per-item remaining the order page
 * uses to cap the cart.
 *
 * A map only contains items that carry a cap — an absent key means unlimited.
 */
export type Remaining = Record<string, number>;

/** Coerce the booth_remaining_stock JSONB result into a typed Remaining map. */
export function parseRemaining(data: unknown): Remaining {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: Remaining = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(0, v);
  }
  return out;
}

/** Remaining for an item: the cap value, or null when the item is uncapped. */
export function remainingFor(
  remaining: Remaining,
  menuItemId: string,
): number | null {
  return Object.prototype.hasOwnProperty.call(remaining, menuItemId)
    ? remaining[menuItemId]
    : null;
}
