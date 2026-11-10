// Presentational "order chit" for the landing hero carousel. Mirrors the real
// OrderCard's layout (big number and name, every option on one line, a single
// attention line, one action button) but takes a small, display-only data
// shape: no server actions, no state. The carousel root (not this component)
// carries aria-hidden since these are decorative.

import { cn } from "@merqo/ui/primitives";
import { Banknote, Clock } from "lucide-react";

export type TicketOption = { group: string; choice: string };

export type TicketLine = {
  q: number;
  name: string;
  opt?: string;
  options?: TicketOption[];
};

export type LandingTicketData = {
  n: string;
  name: string;
  status: "preparing" | "ready" | "completed";
  payment?: "unpaid" | "claimed" | "paid";
  age?: { label: string; tone: "normal" | "aging" | "overdue" };
  lines: TicketLine[];
  action?: string;
};

const STATUS_LABEL = {
  ready: "Ready",
  completed: "Done",
} as const;

// The one thing on the ticket that needs a decision, same wording and ranking
// as ticketAttention in @/lib/ticket. A paid order has nothing to say.
const ATTENTION = {
  claimed: {
    label: "Says paid. Check the payment",
    cls: "bg-status-payment-claimed text-white",
  },
  unpaid: {
    label: "Not paid yet",
    cls: "bg-foreground/[0.06] text-foreground",
  },
} as const;

function ageToneClass(tone: "normal" | "aging" | "overdue"): string {
  if (tone === "overdue") return "text-status-cancelled";
  if (tone === "aging") return "text-status-aging";
  return "text-muted-foreground";
}

/** A line's options, always visible, on one line like the real ticket. */
function lineOptions(line: TicketLine): string | null {
  if (line.options && line.options.length > 0)
    return line.options.map((o) => o.choice).join(" · ");
  return line.opt ?? null;
}

export function LandingTicket({ t }: { t: LandingTicketData }) {
  // One full-card attention wash at a time, by priority, same order as the
  // real OrderCard: overdue outranks an unconfirmed payment, which outranks
  // merely aging.
  let wash: string;
  if (t.age?.tone === "overdue") wash = "ticket-overdue";
  else if (t.payment === "claimed") wash = "ticket-alert";
  else if (t.age?.tone === "aging") wash = "ticket-aging";
  else wash = "border-border";

  const attention =
    t.payment && t.payment !== "paid" ? ATTENTION[t.payment] : null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-background/60",
        wash,
      )}
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
        <div className="min-w-0">
          <p className="font-mono text-2xl font-bold leading-none">#{t.n}</p>
          <p className="mt-1.5 truncate text-sm font-medium">{t.name}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {t.age && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[0.7rem] font-semibold tabular-nums",
                ageToneClass(t.age.tone),
              )}
            >
              <Clock className="size-3" />
              {t.age.label}
            </span>
          )}
          {t.status !== "preparing" && (
            <span
              className="rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
              style={{
                color: `var(--color-status-${t.status})`,
                backgroundColor: `color-mix(in oklch, var(--color-status-${t.status}) 14%, transparent)`,
              }}
            >
              {STATUS_LABEL[t.status]}
            </span>
          )}
        </div>
      </div>

      {attention && (
        <p
          className={cn(
            "mx-3 mb-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.7rem] leading-tight font-semibold",
            attention.cls,
          )}
        >
          <Banknote className="size-3.5 shrink-0" />
          {attention.label}
        </p>
      )}

      <div className="perforation mx-3" />

      <div className="space-y-1.5 px-3 py-2.5">
        {t.lines.map((l, i) => {
          const options = lineOptions(l);
          return (
            <div key={i} className="text-xs">
              <p className="truncate font-medium">
                <span className="font-mono font-bold">{l.q}×</span> {l.name}
              </p>
              {options && (
                <p className="truncate pl-5 text-[0.7rem] font-medium text-foreground/80">
                  {options}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {t.action && (
        <div className="px-3 pb-3">
          <span className="flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            {t.action}
          </span>
        </div>
      )}
    </div>
  );
}
