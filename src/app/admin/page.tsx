import { readAllRows } from "@/lib/supabase/read-all";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLogEntry } from "@merqo/ui";
import { requireAdmin } from "@/lib/admin/access";
// eslint-disable-next-line no-restricted-imports -- admin reads rows across vendors that RLS hides; gated by requireAdmin
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { vendorStallNames } from "@/lib/admin/vendor-names";
import { activationFunnel } from "@/lib/admin/stats";
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
import { PageHeader } from "@merqo/ui";

const SUPPORT_CATEGORY_LABEL: Record<string, string> = {
  pass: "Event pass",
  payment: "Payment",
  pro: "Plan / billing",
  other: "Something else",
};

export const revalidate = 0;

const ENTITLEMENT_SCAN_LIMIT = 1000;
const HELP_REQUEST_LIMIT = 200;

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

  const nowIso = new Date(now).toISOString();
  const countHead = { count: "exact", head: true } as const;

  const [
    { count: vendorTotal },
    { count: signups7d },
    { count: signupsPrior7d },
    { count: activeBooths },
    { count: landingClicks },
    cohortRows,
    cohortBoothRows,
    orders,
    { data: auditRows },
    { data: platformSettingsRow },
    { data: entitlementRows },
    { data: messageRows },
  ] = await Promise.all([
    supabase.from("vendors").select("id", countHead),
    supabase
      .from("vendors")
      .select("id", countHead)
      .gte("created_at", cutoff7d),
    supabase
      .from("vendors")
      .select("id", countHead)
      .gte("created_at", cutoff14d)
      .lt("created_at", cutoff7d),
    supabase.from("booths").select("id", countHead).eq("is_active", true),
    supabase.from("events").select("id", countHead).eq("type", "landing_cta"),
    readAllRows((from, to) =>
      supabase
        .from("vendors")
        .select("id")
        .gte("created_at", cutoff30d)
        .order("id")
        .range(from, to),
    ),
    readAllRows((from, to) =>
      supabase
        .from("booths")
        .select("id, name, vendor_id")
        .gte("created_at", cutoff30d)
        .order("id")
        .range(from, to),
    ),
    readAllRows((from, to) =>
      supabase
        .from("orders")
        .select("id, booth_id, status, total_cents, created_at")
        .gte("created_at", cutoff14d)
        .order("id")
        .range(from, to),
    ),
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
    supabase
      .from("vendor_entitlements")
      .select(
        "vendor_id, tier, founder, stats_window, event_pass_starts_at, event_pass_ends_at, valid_until",
      )
      .or(`tier.neq.free,event_pass_ends_at.gt.${nowIso}`)
      .limit(ENTITLEMENT_SCAN_LIMIT),
    merqoClient
      .schema("merqo")
      .from("support_messages")
      .select("id, user_id, category, body, created_at")
      .eq("kit_slug", "qkit")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(HELP_REQUEST_LIMIT),
  ]);

  const stallNames = await vendorStallNames(
    merqoClient,
    (messageRows ?? []).map((m) => m.user_id),
  );

  const paidVendorIds = new Set(
    (entitlementRows ?? [])
      .filter((r) => resolveEntitlement(storedFromRow(r), now).tier !== "free")
      .map((r) => r.vendor_id),
  );

  const orders30d = orders.filter((o) => o.created_at >= cutoff30d);
  // GMV is total customer spend flowing through booths (vendor sales, not
  // qkit's take); cancelled orders are excluded.
  const gmv30d = orders30d
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total_cents, 0);

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
        .gte("created_at", cutoff14d)
        .order("id")
        .range(from, to),
    );
    statusEventRows.push(...events);
  }

  const knownBooths = new Map(cohortBoothRows.map((b) => [b.id, b]));
  const missingBoothIds = [...new Set(orders.map((o) => o.booth_id))].filter(
    (id) => !knownBooths.has(id),
  );
  for (let offset = 0; offset < missingBoothIds.length; offset += 100) {
    const { data } = await supabase
      .from("booths")
      .select("id, name, vendor_id")
      .in("id", missingBoothIds.slice(offset, offset + 100))
      .limit(100);
    for (const b of data ?? []) knownBooths.set(b.id, b);
  }
  const booths = [...knownBooths.values()];
  const boothNameById = new Map(booths.map((b) => [b.id, b.name]));
  const statusSince = statusSinceByOrder(nonTerminalOrders, statusEventRows);
  const stuckOrders = findStuckOrders(
    nonTerminalOrders.map((o) => ({
      id: o.id,
      booth_id: o.booth_id,
      status: o.status,
      status_since: statusSince.get(o.id) ?? o.created_at,
    })),
    now,
  );

  const bannerSettings = platformSettingsRow ?? DEFAULT_PLATFORM_SETTINGS;
  const activeVendorIds = new Set(
    orders30d.flatMap((o) => knownBooths.get(o.booth_id)?.vendor_id ?? []),
  );

  // Open vendor help requests — the "reach out and help" inbox.
  const messages = (messageRows ?? []).map((m) => ({
    ...m,
    vendorName: stallNames.get(m.user_id) ?? "Unknown vendor",
  }));
  const funnel = activationFunnel(
    cohortRows.map((v) => ({ id: v.id, paid: paidVendorIds.has(v.id) })),
    booths,
    orders30d.map((o) => o.booth_id),
  );

  // Orders: 7d vs prior 7d (Δ).
  const inWindow = (t: string, gte: string, lt?: string) =>
    t >= gte && (lt === undefined || t < lt);
  const orders7d = orders.filter((o) =>
    inWindow(o.created_at, cutoff7d),
  ).length;
  const ordersPrior7d = orders.filter((o) =>
    inWindow(o.created_at, cutoff14d, cutoff7d),
  ).length;

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
      <PageHeader eyebrow="Internal" title="Overview" className="mb-8" />

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
        <Stat
          label="Active vendors · 30d"
          value={activeVendorIds.size}
          delay={60}
        />
        <Stat
          label="Orders · 7d"
          value={orders7d}
          delta={pctChange(orders7d, ordersPrior7d)}
          delay={120}
        />
        <Stat label="Paid vendors" value={paidVendorIds.size} delay={180} />
        <Stat
          label="Signups · 7d"
          value={signups7d ?? 0}
          delta={pctChange(signups7d ?? 0, signupsPrior7d ?? 0)}
          delay={240}
        />
        <Stat label="Vendors" value={vendorTotal ?? 0} delay={300} />
        <Stat label="Active booths" value={activeBooths ?? 0} delay={360} />
        <Stat label="Stuck orders" value={stuckOrders.length} delay={420} />
      </div>

      <ActivationFunnelView funnel={funnel} />

      <p className="text-xs text-muted-foreground">
        Funnel signals · {landingClicks ?? 0} landing CTA clicks
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
