import type { ActivationFunnel } from "@/lib/admin/stats";

const STAGES = [
  { key: "signedUp", label: "Signed up" },
  { key: "withBooth", label: "Created a booth" },
  { key: "withOrder", label: "Took an order" },
  { key: "paid", label: "Subscribed" },
] as const;

/** Vendor activation funnel with drop-off bars + step-conversion %. */
export function ActivationFunnelView({ funnel }: { funnel: ActivationFunnel }) {
  // width basis; avoid divide-by-zero
  const top = funnel.signedUp || 1;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Activation
      </h2>
      <div className="space-y-3">
        {STAGES.map((stage, i) => {
          const n = funnel[stage.key];
          const prev = i === 0 ? n : funnel[STAGES[i - 1].key];
          const stepPct = prev ? Math.round((n / prev) * 100) : 0;
          return (
            <div key={stage.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{stage.label}</span>
                <span className="font-mono tabular-nums">
                  {n}
                  {i > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {stepPct}%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${(n / top) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
