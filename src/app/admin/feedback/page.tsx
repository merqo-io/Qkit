import type { SupabaseClient } from "@supabase/supabase-js";
import { Star } from "lucide-react";
import { requireAdmin } from "@/lib/admin/access";
// eslint-disable-next-line no-restricted-imports -- admin reads rows across vendors that RLS hides; gated by requireAdmin
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { vendorStallNames } from "@/lib/admin/vendor-names";
import { cn, EYEBROW_CLASS } from "@/lib/utils";
import { npsBreakdown } from "@/lib/nps";
import { summarizeReviews, type ReviewRow } from "@/lib/reviews";
import { Paginated } from "@/components/widgets/paginated";
import { Ticket } from "@/components/widgets/ticket";
import { PageHeader } from "@/components/widgets/page-header";

export const revalidate = 0;

/**
 * merqo owns this table's real generated types — this is a hand-written
 * mirror of the vendor_feedback row shape, not a generated type, since
 * merqo.* is outside qkit's own supabase gen types scope (schema: "qkit").
 */
type MerqoVendorFeedbackSchema = {
  merqo: {
    Tables: {
      vendor_feedback: {
        Row: {
          id: string;
          kit_slug: string;
          vendor_id: string;
          nps: number;
          message: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

/** A segment of the NPS bar; flex-grows by its share. */
function Seg({
  n,
  total,
  className,
}: {
  n: number;
  total: number;
  className: string;
}) {
  if (n === 0) return null;
  return <div style={{ flexGrow: n / total }} className={className} />;
}

function StarRow({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            size,
            i < value
              ? "fill-primary text-primary"
              : "text-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}

export default async function AdminFeedbackPage() {
  await requireAdmin();
  const supabase = await createServerClient();
  const [{ data: rows }, { data: boothRows }, { data: vendorList }] =
    await Promise.all([
      supabase
        .from("feedback")
        .select("id, source, rating, message, booth_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("booths").select("id, vendor_id"),
      supabase.from("vendors").select("id"),
    ]);
  const all = rows ?? [];

  // qkit's own metric: vendor → qkit loyalty (NPS) + their written notes.
  // merqo.vendor_feedback's only SELECT policy gates on merqo.merqo_team
  // membership, not qkit.admins — the RLS-scoped client above would silently
  // return zero rows for a qkit admin who isn't also a merqo_team member, so
  // this one query needs the service client instead.
  const serviceSupabase = await createServiceClient();
  const merqoClient =
    serviceSupabase as unknown as SupabaseClient<MerqoVendorFeedbackSchema>;
  const { data: vendorFeedbackRows } = await merqoClient
    .schema("merqo")
    .from("vendor_feedback")
    .select("id, nps, message, created_at")
    .eq("kit_slug", "qkit")
    .order("created_at", { ascending: false })
    .limit(200);
  const vendorFeedback = vendorFeedbackRows ?? [];
  const nps = npsBreakdown(
    vendorFeedback.map((f) => f.nps).filter((n): n is number => n != null),
  );
  const npsComments = vendorFeedback.filter((f) => f.message?.trim());

  // Platform health: how customers rate ordering across ALL booths — an
  // aggregate only. Individual booth reviews live on each vendor's own stats.
  const csat = summarizeReviews(
    all
      .filter((f) => f.source === "customer")
      .map(
        (f): ReviewRow => ({
          rating: f.rating,
          message: null,
          order_number: null,
          booth_id: null,
          created_at: f.created_at,
        }),
      ),
  );

  // Per-vendor CSAT — segmented health, worst-rated first, so problem vendors
  // surface. Scores only (admin never sees the raw reviews — those are the
  // vendor's). Maps each customer rating to its booth's owner.
  const vendorName = await vendorStallNames(
    merqoClient,
    (vendorList ?? []).map((v) => v.id),
  );
  const boothVendor = new Map(
    (boothRows ?? []).map((b) => [b.id, b.vendor_id]),
  );
  const perVendor = new Map<string, { sum: number; count: number }>();
  for (const f of all) {
    if (f.source !== "customer" || f.rating == null || !f.booth_id) continue;
    const vid = boothVendor.get(f.booth_id);
    if (!vid) continue;
    const cur = perVendor.get(vid) ?? { sum: 0, count: 0 };
    cur.sum += f.rating;
    cur.count += 1;
    perVendor.set(vid, cur);
  }
  const vendorCsat = [...perVendor.entries()]
    .map(([vid, { sum, count }]) => ({
      vid,
      name: vendorName.get(vid) ?? "Unknown vendor",
      avg: sum / count,
      count,
    }))
    .sort((a, b) => a.avg - b.avg || b.count - a.count);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-5 py-7">
      <div>
        <PageHeader eyebrow="Internal" title="Feedback" />
      </div>

      {/* ── Hero: vendor NPS (qkit's own loyalty metric) ─────────────────── */}
      <Ticket as="section" shadow="none" className="fade-rise bg-card">
        <div className="px-6 pt-8 pb-5">
          <p className={EYEBROW_CLASS}>Vendor NPS · how vendors rate qkit</p>
          <div className="mt-2 flex items-end gap-3">
            <span className="font-display text-6xl font-semibold leading-none">
              {nps.score ?? "-"}
            </span>
            <span className="pb-1 font-mono text-sm text-muted-foreground">
              {nps.total} response{nps.total === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
            <Seg
              n={nps.detractors}
              total={nps.total}
              className="bg-status-cancelled"
            />
            <Seg
              n={nps.passives}
              total={nps.total}
              className="bg-muted-foreground/40"
            />
            <Seg n={nps.promoters} total={nps.total} className="bg-success" />
          </div>
          <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
            <span>{nps.detractors} detractors</span>
            <span>{nps.passives} passive</span>
            <span className="text-success">{nps.promoters} promoters</span>
          </div>
        </div>

        {npsComments.length > 0 && (
          <>
            <div className="perforation mx-6" />
            <Paginated
              variant="more"
              pageSize={5}
              label="notes"
              className="px-6 py-2"
            >
              {npsComments.map((f) => (
                <div
                  key={f.id}
                  className="border-b border-border/60 py-3 last:border-b-0"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    {f.nps != null && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                        NPS {f.nps}
                      </span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">
                      {when(f.created_at)}
                    </span>
                  </div>
                  <p className="text-sm">{f.message}</p>
                </div>
              ))}
            </Paginated>
          </>
        )}
      </Ticket>

      {/* ── Platform CSAT: aggregate ordering-experience health ──────────── */}
      <section className="fade-rise space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <p className={EYEBROW_CLASS}>Platform CSAT</p>
          <p className="mt-1 text-sm text-muted-foreground">
            How customers rate ordering across every booth: your ordering-UX
            health. Individual booth reviews live on each vendor&apos;s stats.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-display text-5xl font-semibold leading-none">
            {csat.average?.toFixed(1) ?? "-"}
          </span>
          <div>
            <StarRow value={Math.round(csat.average ?? 0)} />
            <p className="font-mono text-xs text-muted-foreground">
              {csat.count} rating{csat.count === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {csat.count > 0 && (
          <div className="space-y-1">
            {([5, 4, 3, 2, 1] as const).map((star) => {
              const n = csat.distribution[star];
              const pct = Math.round((n / csat.count) * 100);
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-muted-foreground">{star}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-muted-foreground">
                    {n}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Per-vendor CSAT — segmented health, worst first ──────────────── */}
      {vendorCsat.length > 0 && (
        <section className="fade-rise space-y-3 rounded-xl border border-border bg-card p-5">
          <div>
            <p className={EYEBROW_CLASS}>Satisfaction by vendor</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lowest-rated first, where ordering quality needs a look. Scores
              only; the reviews stay with each vendor.
            </p>
          </div>
          <Paginated pageSize={8} className="divide-y divide-border/60">
            {vendorCsat.map((v) => (
              <div
                key={v.vid}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="truncate text-sm font-medium">{v.name}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-sm">
                  <span
                    className={cn(
                      "font-mono font-semibold",
                      v.avg < 3.5 && "text-status-cancelled",
                    )}
                  >
                    {v.avg.toFixed(1)}
                  </span>
                  <StarRow value={Math.round(v.avg)} size="size-3.5" />
                  <span className="text-muted-foreground">({v.count})</span>
                </span>
              </div>
            ))}
          </Paginated>
        </section>
      )}
    </div>
  );
}
