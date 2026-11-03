import { readAllRows } from "@/lib/supabase/read-all";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLogEntry } from "@merqo/ui";
import { requireAdmin } from "@/lib/admin/access";
// eslint-disable-next-line no-restricted-imports -- admin reads rows across vendors that RLS hides; gated by requireAdmin
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { vendorStallNames } from "@/lib/admin/vendor-names";
import {
  activationFunnel,
  summarizeEvents,
  summarizeVendors,
} from "@/lib/admin/stats";
import { resolveEntitlement, storedFromRow } from "@/lib/plan";
import { pctChange } from "@/lib/stats";
import { formatPrice, MS_PER_DAY } from "@/lib/utils";
import { DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-settings";
import { BannerForm } from "./banner-form";
import { ActivationFunnelView } from "./activation-funnel";
import { Paginated } from "@/components/widgets/paginated";
import { Stat } from "./stat";
import { ResolveMessageButton } from "./resolve-message-button";
import { StuckOrdersSection } from "./stuck-orders-section";
import { AdminAuditLog } from "./audit-log";
import { HelpFreshnessSection } from "./help-freshness-section";
import { isTerminal } from "@/lib/orders";
import {
  findStuckOrders,
  statusSinceByOrder,
  type OrderStatusEventLite,
} from "@/lib/stuck-orders";
import type { MerqoSupportMessagesSchema } from "@/lib/merqo/support";
import { PageHeader } from "@/components/widgets/page-header";

const SUPPORT_CATEGORY_LABEL: Record<string, string> = {
  pass: "Event pass",
  payment: "Payment",
  pro: "Plan / billing",
  other: "Something else",
};

export const revalidate = 0;

function humanizeDetail(detail: unknown): string {
  if (!detail || typeof detail !== "object") return "";
  return Object.entries(detail as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
}

export default async function AdminPage() {
  await requireAdmin();

  const supabase = await createServerClient();
  // merqo.support_messages' SELECT policy gates on merqo.merqo_team
  // membership, not qkit.admins — the RLS-scoped client above would silently
  // return zero rows for a qkit admin who isn't also a merqo_team member, so
  // this one query needs the service client instead (mirrors the vendor-NPS
  // fix in admin/feedback/page.tsx).
  const merqoClient =
    (await createServiceClient()) as unknown as SupabaseClient<MerqoSupportMessagesSchema>;

  // eslint-disable-next-line react-hooks/purity -- the wall clock is read once per request on purpose
  const now = Date.now();
  const cutoff7d = new Date(now - 7 * MS_PER_DAY).toISOString();
  const cutoff14d = new Date(now - 14 * MS_PER_DAY).toISOString();
  const cutoff30d = new Date(now - 30 * MS_PER_DAY).toISOString();

  const [
    { data: vendorRows },
    { data: boothRows },
    { data: orderRows },
    { data: eventRows },
    { data: auditRows },
    { data: platformSettingsRow },
    { data: entitlementRows },
    { data: messageRows },
  ] = await Promise.all([
    readAllRows((from, to) =>
      supabase
        .from("vendors")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
    readAllRows((from, to) =>
      supabase
        .from("booths")
        .select("id, name, vendor_id, is_active")
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
    readAllRows((from, to) =>
      supabase
        .from("orders")
        .select("id, booth_id, status, total_cents, created_at")
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
    readAllRows((from, to) =>
      supabase
        .from("events")
        .select("type, created_at")
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
    supabase
      .from("admin_audit")
      .select("id, admin_id, action, target_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("platform_settings")
      .select("banner_enabled, banner_message")
      .eq("id", 1)
      .maybeSingle(),
    readAllRows((from, to) =>
      supabase
        .from("vendor_entitlements")
        .select(
          "vendor_id, tier, founder, stats_window, event_pass_starts_at, event_pass_ends_at, valid_until",
        )
        .order("vendor_id")
        .range(from, to),
    ).then((data) => ({ data })),
    readAllRows((from, to) =>
      merqoClient
        .schema("merqo")
        .from("support_messages")
        .select("id, user_id, category, body, created_at")
        .eq("kit_slug", "qkit")
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
  ]);

  const stallNames = await vendorStallNames(
    merqoClient,
    (vendorRows ?? []).map((v) => v.id),
  );

  const entitlementByVendor = new Map(
    (entitlementRows ?? []).map((r) => [
      r.vendor_id,
      resolveEntitlement(storedFromRow(r), now),
    ]),
  );

  // GMV is total customer spend flowing through booths (vendor sales, not
  // qkit's take); cancelled orders are excluded.
  const gmv30d = (orderRows ?? [])
    .filter((o) => o.created_at >= cutoff30d && o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total_cents, 0);

  const vendors = (vendorRows ?? []).map((v) => {
    const ent = entitlementByVendor.get(v.id);
    return {
      ...v,
      name: stallNames.get(v.id) ?? "Unknown vendor",
      paid: (ent?.tier ?? "free") !== "free",
      passExpiresAt: ent?.eventPass?.running ? ent.eventPass.endsAt : null,
    };
  });
  const bannerSettings = platformSettingsRow ?? DEFAULT_PLATFORM_SETTINGS;
  const booths = boothRows ?? [];
  const orders = orderRows ?? [];
  const events = eventRows ?? [];

  // Stuck orders: non-terminal orders sitting past a same-day queue's normal
  // window. Only queried for the orders that could possibly qualify — a
  // terminal order's history is never read. See @/lib/stuck-orders.
  const nonTerminalOrders = orders.filter((o) => !isTerminal(o.status));
  const statusEventRows: OrderStatusEventLite[] = [];
  // Bound URL size and request concurrency while reading every history page.
  for (let offset = 0; offset < nonTerminalOrders.length; offset += 100) {
    const ids = nonTerminalOrders.slice(offset, offset + 100).map((o) => o.id);
    const events = await readAllRows((from, to) =>
      supabase
        .from("order_status_events")
        .select("order_id, to_status, created_at")
        .in("order_id", ids)
        .order("id")
        .range(from, to),
    );
    statusEventRows.push(...events);
  }
  const boothNameById = new Map(booths.map((b) => [b.id, b.name]));
  const statusSince = statusSinceByOrder(
    nonTerminalOrders,
    statusEventRows ?? [],
  );
  const stuckOrders = findStuckOrders(
    nonTerminalOrders.map((o) => ({
      id: o.id,
      booth_id: o.booth_id,
      status: o.status,
      status_since: statusSince.get(o.id) ?? o.created_at,
    })),
    now,
  );

  const vstat = summarizeVendors(vendors, now);
  const estat = summarizeEvents(events, now);

  // Open vendor help requests — the "reach out and help" inbox.
  const messages = (messageRows ?? []).map((m) => ({
    ...m,
    vendorName: stallNames.get(m.user_id) ?? "Unknown vendor",
  }));
  const funnel = activationFunnel(
    vendors,
    booths,
    orders.map((o) => o.booth_id),
  );

  // Orders: 7d vs prior 7d (Δ) + a 14-day trend.
  const inWindow = (t: string, gte: string, lt?: string) =>
    t >= gte && (lt === undefined || t < lt);
  const orders7d = orders.filter((o) =>
    inWindow(o.created_at, cutoff7d),
  ).length;
  const ordersPrior7d = orders.filter((o) =>
    inWindow(o.created_at, cutoff14d, cutoff7d),
  ).length;
  const signupsPrior7d = vendors.filter((v) =>
    inWindow(v.created_at, cutoff14d, cutoff7d),
  ).length;

  const landingClicks = estat.byType["landing_cta"] ?? 0;

  const auditEntries: AuditLogEntry[] = (auditRows ?? []).map((row) => ({
    id: row.id,
    actor: row.admin_id,
    action: row.action,
    target: row.target_id,
    detail: humanizeDetail(row.detail) || null,
    createdAt: row.created_at,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-7">
      <div>
        <PageHeader eyebrow="Internal" title="Overview" />
      </div>

      {messages.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Help requests · {messages.length}
          </h2>
          <Paginated pageSize={6} className="space-y-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-status-cancelled/30 bg-status-cancelled/[0.04] px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <Link
                      href={`/admin/vendors/${m.user_id}`}
                      className="truncate font-medium hover:underline"
                    >
                      {m.vendorName}
                    </Link>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-semibold">
                      {SUPPORT_CATEGORY_LABEL[m.category] ?? m.category}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {m.created_at.slice(0, 16).replace("T", " ")}
                    </span>
                  </p>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">
                    {m.body}
                  </p>
                </div>
                <ResolveMessageButton id={m.id} />
              </div>
            ))}
          </Paginated>
        </section>
      )}

      <StuckOrdersSection
        stuckOrders={stuckOrders}
        boothNameById={boothNameById}
      />

      <HelpFreshnessSection now={new Date()} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="GMV · 30d"
          value={formatPrice(gmv30d)}
          big
          featured
          delay={0}
        />
        <Stat label="Active vendors" value={funnel.withOrder} delay={60} />
        <Stat
          label="Orders · 7d"
          value={orders7d}
          delta={pctChange(orders7d, ordersPrior7d)}
          delay={120}
        />
        <Stat label="Paid vendors" value={vstat.paid} delay={180} />
        <Stat
          label="Signups · 7d"
          value={vstat.new7d}
          delta={pctChange(vstat.new7d, signupsPrior7d)}
          delay={240}
        />
        <Stat label="Vendors" value={vstat.total} delay={300} />
        <Stat
          label="Active booths"
          value={booths.filter((b) => b.is_active).length}
          delay={360}
        />
        <Stat label="Stuck orders" value={stuckOrders.length} delay={420} />
      </div>

      <ActivationFunnelView funnel={funnel} />

      <p className="text-xs text-muted-foreground">
        Funnel signals · {landingClicks} landing CTA clicks
      </p>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Platform banner
        </h2>
        <BannerForm initial={bannerSettings} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent admin activity
        </h2>
        <AdminAuditLog entries={auditEntries} />
      </section>
    </div>
  );
}
