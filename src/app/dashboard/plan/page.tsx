import { Sparkles, Ticket } from "lucide-react";
import { PlanComparisonTable } from "@merqo/ui";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { TIER_LABEL } from "@/lib/plan";
import { PassCountdown } from "./pass-countdown";
import { PageHeader } from "@/components/widgets/page-header";

export const revalidate = 0;

const FEATURES: {
  label: string;
  free: boolean;
  starter: boolean;
  qkit: boolean;
}[] = [
  { label: "Live order board", free: true, starter: true, qkit: true },
  { label: "QR posters", free: true, starter: true, qkit: true },
  {
    label: "Unlimited items & customization",
    free: false,
    starter: true,
    qkit: true,
  },
  {
    label: "Scheduled auto-close hours",
    free: false,
    starter: true,
    qkit: true,
  },
  { label: "Sold-out stock caps", free: false, starter: true, qkit: true },
  { label: "Extra booths", free: false, starter: false, qkit: true },
  {
    label: "Customer queue display (TV)",
    free: false,
    starter: false,
    qkit: true,
  },
  { label: "Order labels", free: false, starter: false, qkit: true },
  { label: "Order-ready push alerts", free: false, starter: false, qkit: true },
  {
    label: "Full history & trends (7/30/90d)",
    free: false,
    starter: false,
    qkit: true,
  },
];

const INCLUDES = {
  free: "1 booth with up to 6 menu items, the live order board, QR posters and today's stats.",
  starter:
    "1 booth with unlimited menu items and customization, scheduled auto-close hours, sold-out stock caps and today's stats.",
  qkit: "Unlimited booths, the customer queue display, order labels, order-ready push alerts and full sales history.",
} as const;

export default async function PlanPage() {
  const { entitlement } = await requireEntitledVendor();
  const { tier, eventPass } = entitlement;

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <div className="flex items-end justify-between gap-3">
        <div>
          <PageHeader eyebrow="Billing" title="Plan" />
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
            tier === "free"
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary"
          }`}
        >
          {tier === "qkit" && <Sparkles className="size-3.5" />}
          {TIER_LABEL[tier]}
        </span>
      </div>

      {eventPass?.running && <PassCountdown expiresAt={eventPass.endsAt} />}

      {eventPass && !eventPass.running && (
        <p className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          <Ticket className="size-4 shrink-0 text-primary" />
          Your Event Pass starts {eventPass.startsAt.slice(0, 10)} and ends{" "}
          {eventPass.endsAt.slice(0, 10)}.
        </p>
      )}

      <p className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
        {INCLUDES[tier]}
      </p>

      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
        Change plan from your Merqo account.
      </p>

      <PlanComparisonTable
        tiers={[
          { key: "free", label: "Free" },
          { key: "starter", label: "Starter" },
          { key: "qkit", label: "qkit" },
        ]}
        rows={FEATURES.map((f) => ({
          label: f.label,
          values: { free: f.free, starter: f.starter, qkit: f.qkit },
        }))}
      />
    </div>
  );
}
