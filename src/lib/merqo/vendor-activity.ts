import type { Plan } from "@/lib/types";
import { formatPrice, MS_PER_DAY } from "@/lib/utils";
import {
  buildVendorHealth,
  type BoothLite,
  type OrderLite,
  type VendorStatus,
} from "@/lib/admin/vendor-health";

export type VendorActivityMetric = { label: string; value: string };

export type VendorActivity = {
  active: boolean;
  plan: Plan | null;
  status: VendorStatus | null;
  metrics: VendorActivityMetric[];
  lastActivityAt: string | null;
};

export type VAVendor = { id: string; plan: Plan; created_at: string };
export type VABooth = BoothLite & { is_active: boolean };
export type VAOrder = OrderLite & { total_cents: number };

/**
 * Pure aggregation behind GET /api/merqo/vendor-activity, once the caller has
 * already resolved the vendor's `vendors` row (a 404 for no row is the
 * route's job, not this function's — this only ever runs for a vendor that
 * does exist). `booths`/`orders` are pre-scoped to this one vendor.
 * `status` reuses `buildVendorHealth`'s exact triage (`@/lib/admin/
 * vendor-health`, the same module the admin console renders from) rather than
 * re-deriving it, so this endpoint's status always agrees with the admin UI.
 */
export function computeVendorActivity(
  vendor: VAVendor,
  {
    booths,
    orders,
    passExpiresAt,
    hasOpenMessage,
  }: {
    booths: VABooth[];
    orders: VAOrder[];
    passExpiresAt: string | null;
    hasOpenMessage: boolean;
  },
  nowMs: number,
): VendorActivity {
  const health = buildVendorHealth(
    {
      vendors: [
        {
          id: vendor.id,
          plan: vendor.plan,
          created_at: vendor.created_at,
          passExpiresAt,
        },
      ],
      booths: booths,
      orders: orders,
      openMessageVendorIds: hasOpenMessage ? new Set([vendor.id]) : new Set(),
    },
    nowMs,
  ).get(vendor.id)!;

  const cutoff30d = nowMs - 30 * MS_PER_DAY;
  const orders30d = orders.filter(
    (o) => o.status !== "cancelled" && Date.parse(o.created_at) >= cutoff30d,
  );
  const revenue30dCents = orders30d.reduce((sum, o) => sum + o.total_cents, 0);
  const activeBooths = booths.filter((b) => b.is_active).length;

  return {
    active: true,
    plan: vendor.plan,
    status: health.status,
    metrics: [
      { label: "Orders (30d)", value: String(orders30d.length) },
      { label: "Revenue (30d)", value: formatPrice(revenue30dCents) },
      { label: "Booths", value: `${activeBooths}/${booths.length}` },
    ],
    lastActivityAt: health.lastOrderAt,
  };
}
