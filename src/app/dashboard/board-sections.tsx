"use client";

import { cn } from "@merqo/ui/primitives";
import type { ReactNode } from "react";

import type { BoardOrder } from "@/lib/types";

export type PhoneSection = "incoming" | "preparing" | "ready";

// One board column. Below `lg` the three share one narrow column, so only the
// one the SectionSwitcher selected shows; a class hides it so the same markup
// serves both layouts and nothing depends on measuring the viewport.
export function OrderSection({
  label,
  orders,
  hiddenOnPhone = false,
  action,
  empty,
  renderCard,
}: {
  label: string;
  orders: BoardOrder[];
  // A control for the whole column, shown at the end of its header row.
  action?: ReactNode;
  hiddenOnPhone?: boolean;
  empty: ReactNode;
  renderCard: (order: BoardOrder) => ReactNode;
}) {
  return (
    <section className={cn("min-w-0", hiddenOnPhone && "hidden lg:block")}>
      <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label} ({orders.length})
        </h2>
        {action}
      </div>
      {orders.length === 0 ? (
        empty
      ) : (
        <div className="grid grid-cols-1 gap-4">{orders.map(renderCard)}</div>
      )}
    </section>
  );
}

/**
 * Phone and tablet switch between Incoming, Preparing and Ready.
 *
 * Stacked, the later columns sit under however many cards the earlier ones
 * hold, well past the fold in a rush, and staff read a missing order as the
 * devices being out of sync (Kessie's AAR, issue #3). Each tab carries its
 * count, so none can look empty; the desktop three-column layout has no switch.
 */
export function SectionSwitcher({
  value,
  onChange,
  counts,
}: {
  value: PhoneSection;
  onChange: (next: PhoneSection) => void;
  counts: Record<PhoneSection, number>;
}) {
  const tabs: { key: PhoneSection; label: string; count: number }[] = [
    { key: "incoming", label: "Incoming", count: counts.incoming },
    { key: "preparing", label: "Preparing", count: counts.preparing },
    { key: "ready", label: "Ready", count: counts.ready },
  ];
  return (
    <div
      role="group"
      aria-label="Which orders to show"
      className="mb-5 flex gap-1 rounded-full border border-border bg-card p-1 lg:hidden"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          aria-pressed={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "min-h-11 flex-1 rounded-full px-2 text-sm font-semibold transition-colors",
            value === tab.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
        >
          {tab.label} ({tab.count})
        </button>
      ))}
    </div>
  );
}

export function NumbersDegradedBanner() {
  return (
    <div
      role="alert"
      className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
    >
      Order numbers may be off. Refresh to retry.
    </div>
  );
}

export function LoadErrorBanner() {
  return (
    <div
      role="alert"
      className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
    >
      Couldn&apos;t load your current orders. Some in-flight orders may be
      missing. Refresh to try again.
    </div>
  );
}
