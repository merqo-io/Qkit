"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ReceiptText } from "lucide-react";
import { getRecentOrdersForBooth, type RecentOrder } from "@/lib/recent-orders";

interface Props {
  boothId: string;
}

// Show this many before the "Show all" toggle — the list is capped at 10, so
// this only collapses the longer tail.
const COLLAPSED = 3;

export function RecentOrders({ boothId }: Props) {
  // Read after mount only — localStorage is unavailable during SSR and would
  // otherwise cause a hydration mismatch.
  const [orders, setOrders] = useState<RecentOrder[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // Intentional post-mount read of a browser-only store (localStorage); the
    // server has no customer identity, so this can only run client-side.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrders(getRecentOrdersForBooth(boothId));
  }, [boothId]);

  if (!orders || orders.length === 0) return null;

  const visible = showAll ? orders : orders.slice(0, COLLAPSED);
  const hidden = orders.length - visible.length;

  return (
    <section className="mb-7 rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <ReceiptText className="size-3.5" />
        Your orders here
      </h2>
      <ul className="space-y-1.5">
        {visible.map((o) => {
          const tokenQuery = o.token ? `?t=${o.token}` : "";
          // An order that pays first has no number until it is paid. Its pay
          // step sends a numbered order on to its status page and says when an
          // unpaid one has expired.
          const href = o.orderNumber
            ? `/order/${boothId}/${o.orderNumber}${tokenQuery}`
            : `/order/${boothId}/pay${tokenQuery}`;
          const label = o.displayNumber ?? o.orderNumber;
          return (
            <li key={o.orderNumber ?? o.token}>
              <Link
                href={href}
                className="group flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-primary/50"
              >
                <span className="truncate">
                  {label ? (
                    <span className="font-mono font-semibold text-primary">
                      #{label}
                    </span>
                  ) : (
                    <span className="font-semibold text-primary">
                      New order
                    </span>
                  )}{" "}
                  <span className="text-muted-foreground">
                    for {o.customerName}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 group-hover:underline">
                  Track →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {(hidden > 0 || showAll) && orders.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 flex min-h-11 w-full items-center justify-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          {showAll ? (
            <>
              Show less <ChevronUp className="size-3.5" />
            </>
          ) : (
            <>
              Show all ({orders.length}) <ChevronDown className="size-3.5" />
            </>
          )}
        </button>
      )}
    </section>
  );
}
