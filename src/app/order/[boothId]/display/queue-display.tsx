"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitTrailingDigit } from "@/lib/orders";
import { usePolling } from "@/hooks/use-polling";
import { playReadyChime, unlockAudio } from "@/lib/order-alerts";
import { getBoothQueueDisplay, type QueueDisplayOrder } from "./actions";
import type { OrderStatus } from "@/lib/types";

const POLL_MS = 5000;
// How long a ready order stays "fresh" — solid fill, full brightness — before
// settling into the steady, muted ready-tile style. A rough proxy for "is
// this order still hot", not literal food temperature: a vendor's own sense
// of how long is too long to sit uncollected sets the real number, so this
// is a starting point, not measured against anything.
const FRESH_MS = 5 * 60 * 1000;
// How long a freshly-ready tile keeps its one-time "stamped" entrance
// (tilted, fade-rise) — separate from FRESH_MS above, which controls how
// long the solid-fill look itself persists.
const FLASH_MS = 3500;

// This is a TV screen — no scrolling — so each column caps how many tiles it
// ever renders rather than overflowing off the bottom. Fixed numbers, not
// measured against the real viewport (no ResizeObserver): simple, predictable,
// easy to bump later if a vendor's screen visibly fits more or fewer. Ready
// tiles are bigger than Preparing tiles, so its cap is lower.
const MAX_VISIBLE_PREPARING = 12;
const MAX_VISIBLE_READY = 8;

interface Props {
  boothId: string;
  boothName: string;
  initialOrders: QueueDisplayOrder[];
}

/**
 * Public TV/second-screen queue display for one booth. Polls (no realtime —
 * see ./actions.ts). A ready order is "fresh" for FRESH_MS (solid fill, full
 * brightness) then settles into a muted, tinted look — a proxy for how long
 * it's been sitting uncollected, so a glance at the Ready column tells a
 * customer or vendor which numbers are still hot versus been up a while.
 * The moment an order first goes ready it also gets a brief one-time
 * "stamped" entrance (tilted -rotate-3, fade-rise — the same reveal the
 * customer's own order-status page uses for its "Ready" stamp,
 * ../[orderNumber]/order-status-poller.tsx), plus an optional chime once the
 * vendor has tapped "Enable sound" (Web Audio needs a user gesture to unlock
 * — see ./README.md).
 */
export function QueueDisplay({ boothId, boothName, initialOrders }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [soundEnabled, setSoundEnabled] = useState(false);
  // When each currently-ready order first became ready. State, not a ref —
  // render must stay pure (no reading refs or calling Date.now() there), so
  // both this and nowMs below are only ever written from effects/handlers.
  const [readyAt, setReadyAt] = useState<Map<string, number>>(new Map());
  // A clock tick for freshness math. Seeded null (not Date.now() at render
  // time — same SSR-hydration-mismatch reasoning as the sibling status
  // page's own nowMs, order-status-poller.tsx), set on mount, then ticks
  // often enough to keep the fresh/aged cutoff reasonably current between
  // polls.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const prevStatusRef = useRef(
    new Map<string, OrderStatus>(
      initialOrders.map((o) => [o.orderNumber, o.status]),
    ),
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock is only readable after mount
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  async function tick() {
    // A transient read failure keeps showing the last good state.
    const next = await getBoothQueueDisplay(boothId);
    if (!next) return;

    const prev = prevStatusRef.current;
    const newlyReady = next.filter(
      (o) => o.status === "ready" && prev.get(o.orderNumber) !== "ready",
    );
    prevStatusRef.current = new Map(next.map((o) => [o.orderNumber, o.status]));

    const nextReadyIds = new Set(
      next.filter((o) => o.status === "ready").map((o) => o.orderNumber),
    );
    const now = Date.now();
    setReadyAt((cur) => {
      const updated = new Map(cur);
      for (const orderNumber of updated.keys()) {
        if (!nextReadyIds.has(orderNumber)) updated.delete(orderNumber);
      }
      for (const o of newlyReady) updated.set(o.orderNumber, now);
      return updated;
    });

    setOrders(next);
    if (newlyReady.length > 0 && soundEnabled) void playReadyChime();
  }

  usePolling(tick, { intervalMs: POLL_MS, enabled: true });

  const preparing = orders.filter((o) => o.status !== "ready");
  const ready = orders.filter((o) => o.status === "ready");

  const visiblePreparing = preparing.slice(0, MAX_VISIBLE_PREPARING);
  const hiddenPreparingCount = preparing.length - visiblePreparing.length;

  function ageMs(orderNumber: string): number {
    const at = readyAt.get(orderNumber);
    return at === undefined || nowMs === null ? Infinity : nowMs - at;
  }

  // Server order, most recently readied first (./actions.ts), so the cap
  // only ever drops the oldest. Freshness is a look, never a reorder: a tile
  // pulled forward while fresh would jump back once it aged.
  const visibleReady = ready.slice(0, MAX_VISIBLE_READY);
  const hiddenReadyCount = ready.length - visibleReady.length;

  return (
    <div className="dark flex h-screen flex-col overflow-hidden bg-background px-8 py-8 text-foreground sm:px-12">
      <header className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">
          {boothName}
        </h1>
        {!soundEnabled && (
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              setSoundEnabled(true);
            }}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
          >
            <Volume2 className="size-4" />
            Enable sound
          </button>
        )}
      </header>

      <div className="perforation my-6 shrink-0" />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-0">
        <section className="flex min-h-0 flex-col">
          <h2 className="mb-4 shrink-0 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Preparing
          </h2>
          {preparing.length === 0 ? (
            <p className="text-muted-foreground">No orders in progress</p>
          ) : (
            <>
              <div className="flex flex-wrap content-start gap-4 overflow-hidden">
                {visiblePreparing.map((o) => {
                  const { lead, last } = splitTrailingDigit(o.displayNumber);
                  return (
                    <div
                      key={o.orderNumber}
                      className="flex size-24 items-center justify-center rounded-2xl border border-border bg-card font-mono text-3xl font-bold sm:size-28 sm:text-4xl"
                    >
                      {lead}
                      {/* Emphasized: a physical pickup-shelf-slot system
                          (bubble-tea-chain style) keys off this digit. */}
                      <span className="underline decoration-4 underline-offset-4">
                        {last}
                      </span>
                    </div>
                  );
                })}
              </div>
              {hiddenPreparingCount > 0 && (
                <p className="mt-3 shrink-0 border-t border-dashed border-border pt-2 text-sm text-muted-foreground">
                  +{hiddenPreparingCount} more preparing
                </p>
              )}
            </>
          )}
        </section>

        <section className="flex min-h-0 flex-col sm:border-l sm:border-dashed sm:border-border sm:pl-8">
          <h2 className="mb-4 shrink-0 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Ready for pickup
          </h2>
          {ready.length === 0 ? (
            <p className="text-muted-foreground">Nothing ready yet</p>
          ) : (
            <>
              <div className="flex flex-wrap content-start gap-6 overflow-hidden">
                {visibleReady.map((o) => {
                  const age = ageMs(o.orderNumber);
                  const fresh = age < FRESH_MS;
                  const flashing = age < FLASH_MS;
                  const { lead, last } = splitTrailingDigit(o.displayNumber);
                  return (
                    <div
                      key={o.orderNumber}
                      className={cn(
                        "flex size-32 items-center justify-center rounded-2xl border-[3px] border-primary font-mono text-5xl font-bold transition-colors duration-700 sm:size-40 sm:text-6xl",
                        fresh
                          ? "bg-primary text-primary-foreground shadow-lg"
                          : "bg-primary/10 text-primary",
                        flashing && "fade-rise -rotate-3",
                      )}
                    >
                      {lead}
                      {/* Emphasized: a physical pickup-shelf-slot system
                          (bubble-tea-chain style) keys off this digit. */}
                      <span className="underline decoration-4 underline-offset-4">
                        {last}
                      </span>
                    </div>
                  );
                })}
              </div>
              {hiddenReadyCount > 0 && (
                <p className="mt-3 shrink-0 border-t border-dashed border-border pt-2 text-sm text-muted-foreground">
                  +{hiddenReadyCount} more ready
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
