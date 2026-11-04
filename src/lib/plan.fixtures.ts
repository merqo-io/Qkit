import { resolveEntitlement, type Entitlement, type Tier } from "@/lib/plan";

const NOW_MS = Date.parse("2026-06-01T00:00:00Z");

function stored(tier: Tier) {
  return {
    tier,
    founder: false,
    statsWindow: tier === "qkit" ? ("90d" as const) : ("24h" as const),
    eventPassStartsAt: null,
    eventPassEndsAt: null,
    validUntil: null,
  };
}

/** Resolved entitlements per tier, for tests that need a ready-made one. */
export const ENTITLEMENTS: Record<Tier, Entitlement> = {
  free: resolveEntitlement(null, NOW_MS),
  starter: resolveEntitlement(stored("starter"), NOW_MS),
  qkit: resolveEntitlement(stored("qkit"), NOW_MS),
};
