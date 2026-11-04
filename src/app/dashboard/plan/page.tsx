import { Sparkles, Ticket } from "lucide-react";
import type { ReactNode } from "react";
import { PricingLadder, fetchPlanCatalog } from "@merqo/ui";
import { requireEntitledVendor } from "@/lib/supabase/get-entitlement";
import { TIER_LABEL } from "@/lib/plan";
import { PassCountdown } from "./pass-countdown";
import { PageHeader } from "@/components/widgets/page-header";

export const revalidate = 0;

const STARTER_COPY = "For testing the waters as a solo operator.";

function describePlans(currentSlug: string) {
  const current = (
    <span className="font-semibold text-primary">Your current plan</span>
  );
  const descriptions: Record<string, ReactNode> = {
    starter: <>{STARTER_COPY}</>,
  };
  descriptions[currentSlug] =
    currentSlug === "starter" ? (
      <>
        {current}. {STARTER_COPY}
      </>
    ) : (
      current
    );
  return descriptions;
}

export default async function PlanPage() {
  const { entitlement } = await requireEntitledVendor();
  const { tier, eventPass } = entitlement;
  const catalog = await fetchPlanCatalog(
    process.env.MERQO_BASE_URL ?? "https://www.merqo.io",
  );

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

      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
        Change plan from your Merqo account.
      </p>

      {catalog ? (
        <PricingLadder
          catalog={catalog}
          highlight="qkit"
          descriptions={describePlans(tier)}
        />
      ) : (
        <p className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          You are on the {TIER_LABEL[tier]} plan. Prices are unavailable right
          now, please check back soon.
        </p>
      )}
    </div>
  );
}
