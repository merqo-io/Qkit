import { MS_PER_DAY } from "@/lib/utils";

/** `paid` is true for any effective tier above free (starter or qkit). */
export type VendorRowLite = { paid: boolean; created_at: string };
export type EventRowLite = { type: string; created_at: string };

export type VendorSummary = {
  total: number;
  free: number;
  paid: number;
  new7d: number;
  new30d: number;
};

export type EventSummary = {
  total: number;
  byType: Record<string, number>;
  last7dByType: Record<string, number>;
};

export type ActivationFunnel = {
  // vendors
  signedUp: number;
  // vendors with ≥1 booth
  withBooth: number;
  // vendors with ≥1 order
  withOrder: number;
  // vendors on a paid tier
  paid: number;
};

/**
 * Vendor activation funnel: signed up → created a booth → took an order →
 * subscribed. Counts DISTINCT vendors at each stage (a vendor with two
 * booths counts once). Foreign booth/order rows (no matching vendor) are
 * ignored. Pure: no DB.
 */
export function activationFunnel(
  vendors: { id: string; paid: boolean }[],
  booths: { id: string; vendor_id: string }[],
  orderBoothIds: string[],
): ActivationFunnel {
  const vendorIds = new Set(vendors.map((v) => v.id));
  const boothToVendor = new Map<string, string>();
  const withBooth = new Set<string>();
  for (const b of booths) {
    boothToVendor.set(b.id, b.vendor_id);
    if (vendorIds.has(b.vendor_id)) withBooth.add(b.vendor_id);
  }
  const withOrder = new Set<string>();
  for (const boothId of new Set(orderBoothIds)) {
    const vendorId = boothToVendor.get(boothId);
    if (vendorId && vendorIds.has(vendorId)) withOrder.add(vendorId);
  }
  return {
    signedUp: vendors.length,
    withBooth: withBooth.size,
    withOrder: withOrder.size,
    paid: vendors.filter((v) => v.paid).length,
  };
}

function withinDays(createdAt: string, nowMs: number, days: number): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && nowMs - t <= days * MS_PER_DAY;
}

/** Aggregate vendor rows into tier counts + recent signups. Pure. */
export function summarizeVendors(
  rows: VendorRowLite[],
  nowMs: number,
): VendorSummary {
  let free = 0;
  let paid = 0;
  let new7d = 0;
  let new30d = 0;
  for (const r of rows) {
    if (r.paid) paid++;
    else free++;
    if (withinDays(r.created_at, nowMs, 7)) new7d++;
    if (withinDays(r.created_at, nowMs, 30)) new30d++;
  }
  return { total: rows.length, free, paid, new7d, new30d };
}

/** Aggregate event rows by type, overall and within the last 7 days. Pure. */
export function summarizeEvents(
  rows: EventRowLite[],
  nowMs: number,
): EventSummary {
  const byType: Record<string, number> = {};
  const last7dByType: Record<string, number> = {};
  for (const r of rows) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    if (withinDays(r.created_at, nowMs, 7)) {
      last7dByType[r.type] = (last7dByType[r.type] ?? 0) + 1;
    }
  }
  return { total: rows.length, byType, last7dByType };
}
