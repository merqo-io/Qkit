import { summarizeVendors, activationFunnel } from "@/lib/admin/stats";
import { MS_PER_DAY } from "@/lib/utils";

export type MerqoMetrics = {
  revenue_cents_30d: number;
  revenue_cents_all: number;
  gmv_cents_30d: number;
  active_vendors: number;
  orders_7d: number;
  orders_prev_7d: number;
  signups_7d: number;
  pro_vendors: number;
  total_vendors: number;
  pending_upgrade_requests: number;
  funnel: {
    signed_up: number;
    with_booth: number;
    with_order: number;
    pro: number;
  };
};

export type MerqoMetricsInput = {
  nowMs: number;
  vendors: { id: string; paid: boolean; created_at: string }[];
  booths: { id: string; vendor_id: string }[];
  orders: {
    booth_id: string;
    status: string;
    total_cents: number;
    created_at: string;
  }[];
  payments: { amount_cents: number; created_at: string }[];
};

export function computeMerqoMetrics(input: MerqoMetricsInput): MerqoMetrics {
  const { nowMs, vendors, booths, orders, payments } = input;
  const cutoff30d = new Date(nowMs - 30 * MS_PER_DAY).toISOString();
  const cutoff7d = new Date(nowMs - 7 * MS_PER_DAY).toISOString();
  const cutoff14d = new Date(nowMs - 14 * MS_PER_DAY).toISOString();

  const revenue_cents_30d = payments
    .filter((p) => p.created_at >= cutoff30d)
    .reduce((s, p) => s + p.amount_cents, 0);
  const revenue_cents_all = payments.reduce((s, p) => s + p.amount_cents, 0);

  const gmv_cents_30d = orders
    .filter((o) => o.created_at >= cutoff30d && o.status !== "cancelled")
    .reduce((s, o) => s + o.total_cents, 0);

  const inWindow = (t: string, gte: string, lt?: string) =>
    t >= gte && (lt === undefined || t < lt);
  const orders_7d = orders.filter((o) =>
    inWindow(o.created_at, cutoff7d),
  ).length;
  const orders_prev_7d = orders.filter((o) =>
    inWindow(o.created_at, cutoff14d, cutoff7d),
  ).length;

  const vstat = summarizeVendors(
    vendors.map((v) => ({ paid: v.paid, created_at: v.created_at })),
    nowMs,
  );
  const f = activationFunnel(
    vendors.map((v) => ({ id: v.id, paid: v.paid })),
    booths,
    orders.map((o) => o.booth_id),
  );

  return {
    revenue_cents_30d,
    revenue_cents_all,
    gmv_cents_30d,
    active_vendors: f.withOrder,
    orders_7d,
    orders_prev_7d,
    signups_7d: vstat.new7d,
    pro_vendors: vstat.paid,
    total_vendors: vstat.total,
    // Required by merqo's metrics schema; upgrade requests no longer exist
    // now that merqo owns subscriptions.
    pending_upgrade_requests: 0,
    funnel: {
      signed_up: f.signedUp,
      with_booth: f.withBooth,
      with_order: f.withOrder,
      pro: f.paid,
    },
  };
}
