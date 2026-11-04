export type Tier = "free" | "starter" | "qkit";

export type StatsRange = "24h" | "7d" | "30d" | "90d";

const ALL_RANGES: readonly StatsRange[] = ["24h", "7d", "30d", "90d"];

const SHORT_RANGES: readonly StatsRange[] = ["24h"];

export function isStatsRange(value: unknown): value is StatsRange {
  return typeof value === "string" && ALL_RANGES.some((r) => r === value);
}

/**
 * The cached merqo entitlement for one vendor (qkit.vendor_entitlements), with
 * camelCase keys and ISO strings. `null` stands for "no push received yet",
 * which resolves to the free tier.
 */
export interface StoredEntitlement {
  tier: Tier;
  founder: boolean;
  statsWindow: "24h" | "90d";
  eventPassStartsAt: string | null;
  eventPassEndsAt: string | null;
  validUntil: string | null;
}

export interface EventPassWindow {
  startsAt: string;
  endsAt: string;
  running: boolean;
}

/**
 * A vendor's resolved capabilities. `null` on a cap means unlimited. `null`
 * (not Infinity) so the object serializes cleanly across the server to client
 * boundary for gating UI.
 */
export interface Entitlement {
  /** Stored tier, or free once valid_until has passed. */
  tier: Tier;
  founder: boolean;
  /** An unexpired Event Pass (running or scheduled), else null. */
  eventPass: EventPassWindow | null;
  maxBooths: number | null;
  maxMenuItems: number | null;
  maxOptionGroupsPerItem: number | null;
  autoCloseHours: boolean;
  stockCaps: boolean;
  /** Customer TV display, printkit labels and order-ready push. */
  counterOps: boolean;
  statsRanges: readonly StatsRange[];
  /** Stats may not reach before this instant (a pass-only vendor), else null. */
  statsSince: string | null;
}

const FREE_CAPS = {
  maxBooths: 1,
  maxMenuItems: 6,
  maxOptionGroupsPerItem: 3,
  autoCloseHours: false,
  stockCaps: false,
} as const;

const STARTER_CAPS = {
  maxBooths: 1,
  maxMenuItems: null,
  maxOptionGroupsPerItem: null,
  autoCloseHours: true,
  stockCaps: true,
} as const;

const QKIT_CAPS = {
  maxBooths: null,
  maxMenuItems: null,
  maxOptionGroupsPerItem: null,
  autoCloseHours: true,
  stockCaps: true,
} as const;

/** Row shape of qkit.vendor_entitlements as the dashboard reads it. */
export interface EntitlementRow {
  tier: Tier;
  founder: boolean;
  stats_window: "24h" | "90d";
  event_pass_starts_at: string | null;
  event_pass_ends_at: string | null;
  valid_until: string | null;
}

export function storedFromRow(row: EntitlementRow): StoredEntitlement {
  return {
    tier: row.tier,
    founder: row.founder,
    statsWindow: row.stats_window,
    eventPassStartsAt: row.event_pass_starts_at,
    eventPassEndsAt: row.event_pass_ends_at,
    validUntil: row.valid_until,
  };
}

function parseMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * TS mirror of the SQL helpers in migration 0113 (vendor_effective_tier,
 * vendor_pass_running). Keep the two in step.
 *
 * The stored tier holds while valid_until is null or in the future; after that
 * the vendor is free, because merqo has no cron to push the lapse. A running
 * Event Pass (starts_at <= now < ends_at) grants qkit-tier capability. Its stats
 * depth is the pass window: stats may not reach before starts_at. A stored qkit
 * tier keeps its own stats_window instead.
 */
export function resolveEntitlement(
  stored: StoredEntitlement | null,
  nowMs: number,
): Entitlement {
  const { tier, statsWindow } = liveTier(stored, nowMs);
  const eventPass = resolveEventPass(stored, nowMs);
  const passRunning = eventPass?.running === true;
  const qkitCapable = tier === "qkit" || passRunning;
  const passOnly = passRunning && tier !== "qkit";

  return {
    tier,
    founder: stored?.founder ?? false,
    eventPass,
    ...capsFor(tier, qkitCapable),
    counterOps: qkitCapable,
    statsRanges: passOnly || statsWindow === "90d" ? ALL_RANGES : SHORT_RANGES,
    statsSince: passOnly ? (eventPass?.startsAt ?? null) : null,
  };
}

function liveTier(
  stored: StoredEntitlement | null,
  nowMs: number,
): { tier: Tier; statsWindow: "24h" | "90d" } {
  const validUntilMs = parseMs(stored?.validUntil ?? null);
  if (!stored || (validUntilMs !== null && validUntilMs <= nowMs)) {
    return { tier: "free", statsWindow: "24h" };
  }
  return { tier: stored.tier, statsWindow: stored.statsWindow };
}

function capsFor(tier: Tier, qkitCapable: boolean) {
  if (qkitCapable) return QKIT_CAPS;
  return tier === "starter" ? STARTER_CAPS : FREE_CAPS;
}

function resolveEventPass(
  stored: StoredEntitlement | null,
  nowMs: number,
): EventPassWindow | null {
  const startsMs = parseMs(stored?.eventPassStartsAt ?? null);
  const endsMs = parseMs(stored?.eventPassEndsAt ?? null);
  if (!stored?.eventPassStartsAt || !stored.eventPassEndsAt) return null;
  if (startsMs === null || endsMs === null || endsMs <= nowMs) return null;
  return {
    startsAt: stored.eventPassStartsAt,
    endsAt: stored.eventPassEndsAt,
    running: startsMs <= nowMs,
  };
}

export function canAddBooth(
  ent: Entitlement,
  currentBoothCount: number,
): boolean {
  return ent.maxBooths === null || currentBoothCount < ent.maxBooths;
}

export function canAddMenuItem(
  ent: Entitlement,
  currentItemCount: number,
): boolean {
  return ent.maxMenuItems === null || currentItemCount < ent.maxMenuItems;
}

/**
 * Whether a menu item may carry `count` option groups under this entitlement.
 * Used both to block saving and to disable the "add group" affordance.
 */
export function canHaveOptionGroups(ent: Entitlement, count: number): boolean {
  return (
    ent.maxOptionGroupsPerItem === null || count <= ent.maxOptionGroupsPerItem
  );
}
