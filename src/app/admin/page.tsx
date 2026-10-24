import { readAllRows } from "@/lib/supabase/read-all";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLogEntry } from "@merqo/ui";
import { requireAdmin } from "@/lib/admin/access";
// eslint-disable-next-line no-restricted-imports -- admin reads rows across vendors that RLS hides; gated by requireAdmin
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { vendorStallNames } from "@/lib/admin/vendor-names";
import {
  activationFunnel,
  latestActivePassByVendor,
  summarizeEvents,
  summarizeVendors,
} from "@/lib/admin/stats";
import { pctChange, windowSeries, type StatsOrder } from "@/lib/stats";
import { formatPrice, MS_PER_DAY } from "@/lib/utils";
import type { Plan } from "@/lib/types";
import { DEFAULT_PRICING } from "@/lib/pricing";
import { DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-settings";
import { type AdminVendorRow } from "./vendor-manage";
import { PricingSection } from "./pricing-section";
import { BannerForm } from "./banner-form";
import { ActivationFunnelView } from "./activation-funnel";
import { Paginated } from "@/components/widgets/paginated";
import { Stat } from "./stat";
import { ResolveRequestButton } from "./resolve-request-button";
import { ResolveMessageButton } from "./resolve-message-button";
import { StuckOrdersSection } from "./stuck-orders-section";
import { AdminAuditLog } from "./audit-log";
import { isTerminal } from "@/lib/orders";
import {
  findStuckOrders,
  statusSinceByOrder,
  type OrderStatusEventLite,
} from "@/lib/stuck-orders";
import type { MerqoSupportMessagesSchema } from "@/lib/merqo/support";
import { PageHeader } from "@/components/widgets/page-header";

// Lazy-loaded: pulls in recharts, code-split out of the initial admin bundle.
const TrendChart = dynamic(() =>
  import("../dashboard/stats/trend-chart").then((m) => m.TrendChart),
);

const SUPPORT_CATEGORY_LABEL: Record<string, string> = {
  pass: "Event pass",
  payment: "Payment",
  pro: "Pro / billing",
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

  // Reading the wall clock in an async server component is intentional here.
  // eslint-disable-next-line react-hooks/purity
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
    { data: pricingRow },
    { data: platformSettingsRow },
    { data: licenseRows },
    { data: paymentRows },
    { data: requestRows },
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
      .from("pricing")
      .select("event_pass_cents, monthly_cents, currency")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("platform_settings")
      .select("banner_enabled, banner_message")
      .eq("id", 1)
      .maybeSingle(),
    readAllRows((from, to) =>
      supabase
        .from("licenses")
        .select("vendor_id, valid_from, expires_at")
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
    readAllRows((from, to) =>
      supabase
        .from("payments")
        .select("amount_cents, created_at")
        .order("id")
        .range(from, to),
    ).then((data) => ({ data })),
    readAllRows((from, to) =>
      supabase
        .from("purchase_requests")
        .select("id, vendor_id, kind, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .order("id")
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

  const licenses = licenseRows ?? [];
  const payments = paymentRows ?? [];

  const stallNames = await vendorStallNames(
    merqoClient,
    (vendorRows ?? []).map((v) => v.id),
  );

  const passByVendor = latestActivePassByVendor(licenses, now);

  // qkit's own revenue — what we actually collected, from the payments ledger
  // (NOT vendor GMV). Beta comps record no payment, so this is honest earnings.
  const revenue30d = payments
    .filter((p) => p.created_at >= cutoff30d)
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const revenueAll = payments.reduce((sum, p) => sum + p.amount_cents, 0);

  // GMV — total customer spend flowing through booths (vendor sales, not qkit's
  // take). The marketplace's throughput; cancelled orders excluded.
  const gmv30d = (orderRows ?? [])
    .filter((o) => o.created_at >= cutoff30d && o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total_cents, 0);

  const vendors: AdminVendorRow[] = (vendorRows ?? []).map((v) => ({
    ...v,
    name: stallNames.get(v.id) ?? "Unknown vendor",
    passExpiresAt: passByVendor.get(v.id) ?? null,
  }));
  const pricing = pricingRow ?? DEFAULT_PRICING;
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

  // Pending upgrade requests (the admin inbox). Named for display.
  const vendorName = stallNames;
  const requests = (requestRows ?? []).map((r) => ({
    ...r,
    vendorName: vendorName.get(r.vendor_id) ?? "Unknown vendor",
  }));
  // Open vendor help requests — the "reach out and help" inbox.
  const messages = (messageRows ?? []).map((m) => ({
    ...m,
    vendorName: vendorName.get(m.user_id) ?? "Unknown vendor",
  }));
  const funnel = activationFunnel(
    vendors as { id: string; plan: Plan }[],
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

  // 14-day trend of qkit revenue (collected pass/sub amounts), not vendor sales.
  const revSeries = windowSeries(
    payments.map(
      (p): StatsOrder => ({
        status: "completed",
        total_cents: p.amount_cents,
        items: [],
        created_at: p.created_at,
      }),
    ),
    now,
    14,
    MS_PER_DAY,
  );

  const landingClicks = estat.byType["landing_cta"] ?? 0;
  const upgradeClicks = estat.byType["upgrade_cta"] ?? 0;

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

      {requests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upgrade requests · {requests.length}
          </h2>
          <Paginated pageSize={8} className="space-y-2">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.vendorName}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    wants{" "}
                    {r.kind === "monthly" ? "Monthly Pro" : "an event pass"} ·{" "}
                    {r.created_at.slice(0, 16).replace("T", " ")}
                  </p>
                </div>
                <ResolveRequestButton id={r.id} />
              </div>
            ))}
          </Paginated>
        </section>
      )}

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

      {/* North-star band — qkit revenue leads; active vendors is the leading
          indicator behind it. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="qkit revenue · 30d"
          value={formatPrice(revenue30d)}
          big
          featured
          delay={0}
        />
        <Stat label="GMV · 30d" value={formatPrice(gmv30d)} delay={60} />
        <Stat label="Active vendors" value={funnel.withOrder} delay={120} />
        <Stat
          label="Orders · 7d"
          value={orders7d}
          delta={pctChange(orders7d, ordersPrior7d)}
          delay={180}
        />
        <Stat
          label="Revenue · all time"
          value={formatPrice(revenueAll)}
          delay={240}
        />
        <Stat label="Pro vendors" value={vstat.pro} delay={300} />
        <Stat
          label="Signups · 7d"
          value={vstat.new7d}
          delta={pctChange(vstat.new7d, signupsPrior7d)}
          delay={360}
        />
        <Stat label="Vendors" value={vstat.total} delay={420} />
        <Stat
          label="Active booths"
          value={booths.filter((b) => b.is_active).length}
          delay={480}
        />
        <Stat label="Stuck orders" value={stuckOrders.length} delay={540} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ActivationFunnelView funnel={funnel} />
        <TrendChart series={revSeries} range="14d" title="qkit revenue" />
      </div>

      <p className="text-xs text-muted-foreground">
        Funnel signals · {landingClicks} landing CTA · {upgradeClicks} upgrade
        CTA clicks
      </p>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pricing
        </h2>
        <PricingSection initial={pricing} />
      </section>

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
