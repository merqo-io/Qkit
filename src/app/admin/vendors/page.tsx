import { readAllRows } from "@/lib/supabase/read-all";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin/access";
// eslint-disable-next-line no-restricted-imports -- admin reads rows across vendors that RLS hides; gated by requireAdmin
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { vendorStallNames } from "@/lib/admin/vendor-names";
import { latestActivePassByVendor, summarizeVendors } from "@/lib/admin/stats";
import {
  buildVendorHealth,
  passHoursLeft,
  statusRank,
  type VendorLite,
} from "@/lib/admin/vendor-health";
import { pctChange } from "@/lib/stats";
import { MS_PER_DAY } from "@/lib/utils";
import type { MerqoSupportMessagesSchema } from "@/lib/merqo/support";
import { Stat } from "../stat";
import { VendorList, type VendorListItem } from "../vendor-list";
import { PageHeader } from "@/components/widgets/page-header";

export const revalidate = 0;

export default async function AdminVendorsPage() {
  await requireAdmin();
  const supabase = await createServerClient();
  // merqo.support_messages' SELECT policy gates on merqo.merqo_team
  // membership, not qkit.admins — the RLS-scoped client would silently return
  // zero rows for a qkit admin who isn't also a merqo_team member, so this one
  // query needs the service client instead (mirrors admin/page.tsx).
  const merqoClient =
    (await createServiceClient()) as unknown as SupabaseClient<MerqoSupportMessagesSchema>;

  // eslint-disable-next-line react-hooks/purity -- the wall clock is read once per request on purpose
  const now = Date.now();
  const cutoff7d = new Date(now - 7 * MS_PER_DAY).toISOString();
  const cutoff14d = new Date(now - 14 * MS_PER_DAY).toISOString();

  const [
    { data: vendorRows },
    { data: licenseRows },
    { data: boothRows },
    { data: orderRows },
    { data: messageRows },
  ] = await Promise.all([
    readAllRows((from, to) =>
      supabase
        .from("vendors")
        .select("id, plan, created_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
    readAllRows((from, to) =>
      supabase
        .from("licenses")
        .select("vendor_id, valid_from, expires_at")
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
    readAllRows((from, to) =>
      supabase
        .from("booths")
        .select("id, vendor_id, created_at")
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
    readAllRows((from, to) =>
      supabase
        .from("orders")
        .select("booth_id, status, created_at")
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
    readAllRows((from, to) =>
      merqoClient
        .schema("merqo")
        .from("support_messages")
        .select("user_id")
        .eq("kit_slug", "qkit")
        .eq("status", "open")
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
  ]);

  const rows = vendorRows ?? [];
  const stallNames = await vendorStallNames(
    merqoClient,
    rows.map((v) => v.id),
  );
  const passByVendor = latestActivePassByVendor(licenseRows ?? [], now);
  const openMsgVendors = new Set((messageRows ?? []).map((m) => m.user_id));

  const vendorLites: VendorLite[] = rows.map((v) => ({
    id: v.id,
    plan: v.plan,
    created_at: v.created_at,
    passExpiresAt: passByVendor.get(v.id) ?? null,
  }));
  const health = buildVendorHealth(
    {
      vendors: vendorLites,
      booths: boothRows ?? [],
      orders: orderRows ?? [],
      openMessageVendorIds: openMsgVendors,
    },
    now,
  );

  const items: VendorListItem[] = rows
    .map((v) => {
      const h = health.get(v.id)!;
      const expiry = passByVendor.get(v.id);
      return {
        id: v.id,
        name: stallNames.get(v.id) ?? "Unknown vendor",
        plan: v.plan,
        created_at: v.created_at,
        passHoursLeft: passHoursLeft(expiry, now),
        status: h.status,
        orders7d: h.orders7d,
        lastOrderAt: h.lastOrderAt,
        boothCount: h.boothCount,
      };
    })
    // Most-urgent first; ties keep the newest signup on top.
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        b.created_at.localeCompare(a.created_at),
    );

  const vstat = summarizeVendors(vendorLites, now);
  const signupsPrior7d = vendorLites.filter(
    (v) => v.created_at >= cutoff14d && v.created_at < cutoff7d,
  ).length;
  const onPass = vendorLites.filter((v) => v.passExpiresAt).length;
  const atRisk = items.filter((i) =>
    ["attention", "expiring", "stuck"].includes(i.status),
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-7">
      <div>
        <PageHeader eyebrow="Internal" title="Vendors" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Vendors" value={vstat.total} delay={0} />
        <Stat label="Needs a look" value={atRisk} delay={60} />
        <Stat label="On a live pass" value={onPass} delay={120} />
        <Stat
          label="Signups · 7d"
          value={vstat.new7d}
          delta={pctChange(vstat.new7d, signupsPrior7d)}
          delay={180}
        />
      </div>

      <VendorList vendors={items} />
    </div>
  );
}
