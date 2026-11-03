import type { Entitlement } from "@/lib/plan";

export type BoothAccessInput = {
  id: string;
  is_active: boolean;
  created_at: string;
};

/**
 * Which of a vendor's booths are servable to customers right now. Unlimited
 * entitlement (qkit tier or a running Event Pass) → every active booth. Limited (free) → only the oldest
 * `maxBooths` active booths by created_at; the rest are "paused" — they exist
 * and the vendor can edit them, but customers can't order from them. Mirrors the
 * booth_servable SQL function so the dashboard and the DB agree on which serve.
 *
 * This is what closes the "get a pass, create many booths, keep them after it
 * expires" leak: serveability is recomputed from the live entitlement, not
 * frozen at creation.
 */
export function servableBoothIds(
  booths: BoothAccessInput[],
  ent: Entitlement,
): Set<string> {
  const active = booths.filter((b) => b.is_active);
  if (ent.maxBooths === null) return new Set(active.map((b) => b.id));
  const oldestFirst = [...active].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const cap = Math.max(0, ent.maxBooths);
  return new Set(oldestFirst.slice(0, cap).map((b) => b.id));
}

/** An active booth beyond the plan's serve limit — shown as "paused" in the UI. */
export function isBoothPaused(
  booth: BoothAccessInput,
  servable: Set<string>,
): boolean {
  return booth.is_active && !servable.has(booth.id);
}
