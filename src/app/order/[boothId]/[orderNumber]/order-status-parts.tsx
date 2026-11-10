"use client";

import { cn } from "@merqo/ui/primitives";
import {
  Bell,
  BellRing,
  Check,
  ChefHat,
  ClipboardCheck,
  ShoppingBag,
  WifiOff,
} from "lucide-react";

import { isNotifySupported } from "@/lib/order-alerts";
import { staleNotice } from "./order-status-copy";
import {
  estimateRangeLabel,
  isTerminal,
  orderStageIndex,
  queuePositionLabel,
  ORDER_STAGES,
  type OrderStage,
} from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

const STAGE_LABEL: Record<OrderStage, string> = {
  received: "Received",
  preparing: "Preparing",
  ready: "Ready",
  collected: "Collected",
};

const STAGE_ICON: Record<OrderStage, typeof Check> = {
  received: ClipboardCheck,
  preparing: ChefHat,
  ready: BellRing,
  collected: ShoppingBag,
};

/**
 * The order's four stages on one line, all visible from the start so the
 * finish is in sight the whole wait. Stages already reached are filled; the
 * one the order is on carries the stage's own icon and a slow pulse; the rest
 * are outlines. "Received" is reached the moment the page loads, so the track
 * never opens empty: a wait that has visibly begun is easier to sit through
 * than one that looks like nothing has happened yet.
 */
export function StageTrack({ status }: { status: OrderStatus }) {
  const current = orderStageIndex(status);
  return (
    <ol aria-label="Order progress" className="flex items-start">
      {ORDER_STAGES.map((stage, i) => {
        const reached = i <= current;
        const isCurrent = i === current;
        const Icon = i < current ? Check : STAGE_ICON[stage];
        return (
          <li
            key={stage}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center gap-2"
          >
            {/* The connector into this stage, drawn behind the node. */}
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-5 right-1/2 left-[-50%] h-0.5 -translate-y-1/2",
                  reached ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <span className="relative z-10 flex size-10 items-center justify-center">
              {isCurrent && status !== "completed" && (
                <span
                  aria-hidden="true"
                  className="stage-pulse absolute inset-0 rounded-full bg-primary/35"
                />
              )}
              <span
                className={cn(
                  "relative flex size-10 items-center justify-center rounded-full border-2 transition-colors",
                  reached
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
            </span>
            <span
              className={cn(
                "text-xs leading-tight",
                isCurrent ? "font-bold text-foreground" : "font-medium",
                !reached && "text-muted-foreground",
              )}
            >
              {STAGE_LABEL[stage]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Range-based rather than a precise countdown: waiting-line research says
// uncertainty is what makes a wait feel worse, not the wait itself, so a
// visible-but-honest estimate beats hiding it or over-promising a single
// number. Falls back to queue position when there is not enough recent history
// for a time estimate yet.
export function WaitEstimate({
  wait,
}: {
  wait: { seconds: number | null; ordersAhead: number } | null;
}) {
  if (!wait) return null;
  const timed = wait.seconds !== null;
  return (
    <div className="flex items-baseline justify-center gap-2 rounded-xl bg-primary/[0.06] px-5 py-3">
      {timed && <span className="text-sm text-muted-foreground">About</span>}
      <span className="font-display text-2xl font-bold text-primary">
        {wait.seconds !== null
          ? estimateRangeLabel(wait.seconds)
          : queuePositionLabel(wait.ordersAhead)}
      </span>
    </div>
  );
}

// The offer to be told when the order is ready, then the confirmation that it
// is armed. Offered even where notifications are not supported (iOS Safari),
// because the tap is also what unlocks sound; hidden once armed or once
// permission is already granted, and moot once the order is ready or done.
export function ReadyAlerts({
  waiting,
  armed,
  permission,
  requesting,
  onEnable,
}: {
  waiting: boolean;
  armed: boolean;
  permission: NotificationPermission | null;
  requesting: boolean;
  onEnable: () => void;
}) {
  if (!waiting) return null;
  const granted = permission === "granted";
  if (!armed && !granted)
    return (
      <button
        type="button"
        onClick={onEnable}
        disabled={requesting}
        className="mx-auto flex min-h-11 items-center gap-2 rounded-full border border-primary/40 bg-primary/[0.04] px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
      >
        <Bell className="size-4" />
        {requesting ? "Just a sec…" : "Alert me when it's ready"}
      </button>
    );
  // Be honest about what they'll get: a system popup only where supported.
  const notifyWorks = isNotifySupported() && granted;
  return (
    <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground">
      <BellRing className="size-3.5 text-primary" />
      {notifyWorks
        ? "We'll alert you the moment it's ready"
        : "We'll chime the moment it's ready (keep this tab open)"}
    </p>
  );
}

// Misses in a row before the page admits it has lost touch. One miss is a
// blip on event-site signal; two is ten seconds of saying something stale.
const STALE_AFTER_MISSES = 2;

/** The headline and detail for where an order stands, plus the lost-touch notice. */
export function StatusHeadline({
  status,
  copy,
  misses,
  lastCheckedAt,
}: {
  status: OrderStatus;
  copy: { headline: string; detail: string };
  misses: number;
  lastCheckedAt: number | null;
}) {
  const ready = status === "ready";
  // Ready takes over the block: it is the moment the whole page exists for,
  // so it is the one state drawn in its own colour and at full size.
  return (
    <div
      className={cn(
        "space-y-1.5",
        ready &&
          "fade-rise rounded-2xl border-2 border-status-ready bg-status-ready/10 px-4 py-5",
      )}
    >
      {/* Live region: the status text is always mounted and only its text
        changes on poll, so a screen reader announces the transition (e.g.
        "It's ready") without a visual cue (SC 4.1.3). */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "font-display font-semibold text-balance",
          ready ? "text-3xl text-status-ready" : "text-2xl",
        )}
      >
        {copy.headline}
      </p>
      <p
        className={cn(
          "text-sm text-balance",
          ready ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {copy.detail}
      </p>
      {misses >= STALE_AFTER_MISSES && !isTerminal(status) && (
        <p
          role="status"
          className="mx-auto flex w-fit items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning"
        >
          <WifiOff className="size-4" aria-hidden="true" />
          {staleNotice(lastCheckedAt)}
        </p>
      )}
    </div>
  );
}
