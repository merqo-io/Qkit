"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BoardOrder } from "@/lib/types";

// Which of the two board sections a phone-width screen is showing.
export type PhoneSection = "incoming" | "accepted";

// One board column (Incoming or Accepted). `solo` means the other column is
// empty — spans both grid tracks and gets the fuller card-grid breakpoints,
// since it then has the whole board's width to itself.
export function OrderSection({
  label,
  orders,
  solo,
  showHeader,
  hiddenOnPhone = false,
  action,
  renderCard,
}: {
  label: string;
  orders: BoardOrder[];
  solo: boolean;
  showHeader: boolean;
  // A control for the whole column, shown at the end of its header row.
  action?: ReactNode;
  // Below `sm` the two sections share one narrow column, so only the one the
  // SectionSwitcher has selected is shown. Hidden with a class rather than by
  // not rendering, so the same markup serves both layouts and nothing depends
  // on measuring the viewport.
  hiddenOnPhone?: boolean;
  renderCard: (order: BoardOrder) => ReactNode;
}) {
  return (
    <section
      className={cn(
        solo && "sm:col-span-2",
        hiddenOnPhone && "hidden sm:block",
      )}
    >
      {showHeader && (
        <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label} ({orders.length})
          </h2>
          {action}
        </div>
      )}
      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          solo
            ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "lg:grid-cols-2",
        )}
      >
        {orders.map(renderCard)}
      </div>
    </section>
  );
}

/**
 * Phone-only switch between Incoming and Accepted.
 *
 * Stacked on a narrow screen, Accepted sits under however many Incoming cards
 * there are, which during a rush is well past the fold: staff accepted an order
 * on the board, could not find it on their phone, and read that as the two
 * devices being out of sync (Kessie's AAR, issue #3). Each side carries its
 * count, so neither can look empty, and the tablet/desktop two-column layout is
 * untouched.
 */
export function SectionSwitcher({
  value,
  onChange,
  incomingCount,
  acceptedCount,
}: {
  value: PhoneSection;
  onChange: (next: PhoneSection) => void;
  incomingCount: number;
  acceptedCount: number;
}) {
  const tabs: { key: PhoneSection; label: string; count: number }[] = [
    { key: "incoming", label: "Incoming", count: incomingCount },
    { key: "accepted", label: "Accepted", count: acceptedCount },
  ];
  return (
    <div
      role="group"
      aria-label="Which orders to show"
      className="mb-5 flex gap-1 rounded-full border border-border bg-card p-1 sm:hidden"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          aria-pressed={value === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "min-h-11 flex-1 rounded-full px-3 text-sm font-semibold transition-colors",
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
