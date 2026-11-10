"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@merqo/ui/primitives";

import { useAsyncAction } from "@/hooks/use-async-action";
import { toast } from "sonner";
import { usePolling } from "@/hooks/use-polling";
import {
  isNotifySupported,
  notifyPermission,
  playReadyChime,
  requestNotifyPermission,
  unlockAudio,
} from "@/lib/order-alerts";
import { noteDisplayNumber } from "@/lib/recent-orders";
import { subscribeToPush } from "@/lib/push/client";
import { savePushSubscription } from "./push-actions";
import {
  getOrderStatus,
  getWaitEstimate,
  confirmArrival,
} from "./status-actions";
import { elapsedLabel, isTerminal } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";
import { statusCopy } from "./order-status-copy";
import {
  ReadyAlerts,
  StageTrack,
  StatusHeadline,
  WaitEstimate,
} from "./order-status-parts";
import { useReadyAlert } from "./use-ready-alert";

// Poll cadence. The customer status page is poll-only by design: Supabase
// realtime (WebSocket) is unreliable on the devices customers actually use —
// Safari/iOS and in-app webviews (Instagram/WhatsApp/WeChat) flaky-block or
// drop the socket. Order status changes on a minute scale, so a few seconds of
// latency is fine and a poll works everywhere. The vendor dashboard, on
// desktop where latency matters, keeps realtime.
const POLL_MS = 5000;

interface Props {
  boothId: string;
  orderNumber: string;
  // Shown in copy; may differ from orderNumber under daily-reset display.
  displayNumber: string;
  token: string;
  initialStatus: OrderStatus;
  boothName: string;
  // ISO created_at, for the "placed N min ago" stamp
  placedAt: string;
  // True while this order still expects payment and the vendor hasn't
  // confirmed receiving it yet — kitchen status and payment status advance
  // independently, so "preparing"/"ready" can be true before payment is.
  // On this page that always means the customer has sent their payment and
  // the stall is checking it: a still-unpaid order is shown /pay instead.
  awaitingPayment: boolean;
  // The customer has told the stall they paid (confirmed by the stall or
  // not). Changes what a cancelled order says about their money.
  paymentSent: boolean;
  // Whether this booth waits for the customer's own "I'm here" tap. A
  // 'pending' order can also mean the vendor hasn't accepted it yet (no
  // printer connected, 0086) — that case shows no self-start button.
  requiresArrivalConfirm: boolean;
}

export function OrderStatusPoller({
  boothId,
  orderNumber,
  displayNumber,
  token,
  initialStatus,
  boothName,
  placedAt,
  awaitingPayment,
  paymentSent,
  requiresArrivalConfirm,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [misses, setMisses] = useState(0);
  // Set by the first poll that succeeds, never during render, so the server
  // and the browser cannot disagree about the time.
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  // null = nothing to show at all (order not found — shouldn't happen once
  // mounted, but poll-only pages must tolerate a transient blip). Otherwise
  // seconds may itself be null (not enough recent history) while ordersAhead
  // is still known — the queue-position fallback covers that case instead of
  // showing nothing. Recomputed on the same poll as status, live not frozen.
  const [wait, setWait] = useState<{
    seconds: number | null;
    ordersAhead: number;
  } | null>(null);
  // null until known (avoids SSR/hydration mismatch); "default" = can ask.
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  // Alerts armed on this page: audio unlocked, and notifications requested where
  // supported. Tracked separately so iOS Safari (no Notification API) can still
  // arm sound + title-flash.
  const [armed, setArmed] = useState(false);
  const [requesting, setRequesting] = useState(false);
  // Client-only clock for the "placed N min ago" stamp. Kept bespoke rather than
  // useNow(): that seeds Date.now() in its initializer, which on this SSR'd page
  // would differ between server and client render (hydration mismatch). Starting
  // null and setting it in an effect makes the server and first client render
  // agree. Ticks each 30s (matches the minute-granular label); stops once the
  // order is terminal — a finished order's stamp no longer changes.
  const [nowMs, setNowMs] = useState<number | null>(null);

  const { pending: confirming, run: runConfirmArrival } = useAsyncAction();

  function onConfirmArrival() {
    return runConfirmArrival(async () => {
      const res = await confirmArrival(boothId, orderNumber, token);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setStatus("preparing");
    });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock is only readable after mount
    setPermission(notifyPermission());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock is only readable after mount
    setNowMs(Date.now());
    if (isTerminal(status)) return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [status]);

  // Web push reaches the customer with the phone locked, where the poll and
  // the page's own popup cannot. Best-effort and silent: without it the page
  // still chimes and pops up while open.
  const enablePush = useCallback(async () => {
    try {
      const sub = await subscribeToPush();
      if (sub) await savePushSubscription(boothId, orderNumber, token, sub);
    } catch {
      // Push is an extra; the opt-in has already armed the page's own alerts.
    }
  }, [boothId, orderNumber, token]);

  // Permission granted on an earlier visit hides the opt-in, so subscribe here.
  const waitingForReady = status !== "ready" && !isTerminal(status);
  useEffect(() => {
    if (permission === "granted" && waitingForReady) void enablePush();
  }, [permission, waitingForReady, enablePush]);

  async function onEnableAlerts() {
    setRequesting(true);
    // Unlock audio on this gesture (the only reliable moment on mobile), then
    // request notification permission where the API exists.
    unlockAudio();
    if (isNotifySupported()) {
      const result = await requestNotifyPermission();
      setPermission(result);
    }
    setArmed(true);
    setRequesting(false);
    // A confirming chime proves to the customer that sound is now on.
    void playReadyChime();
  }

  // Poll the status until it reaches a terminal state. Works on every browser
  // (no WebSocket dependency); the shared hook pauses while backgrounded and
  // refreshes the instant the tab returns.
  const poll = useCallback(async () => {
    let next: OrderStatus | null;
    let estimate: Awaited<ReturnType<typeof getWaitEstimate>>;
    try {
      [next, estimate] = await Promise.all([
        getOrderStatus(boothId, orderNumber, token),
        getWaitEstimate(boothId, orderNumber, token),
      ]);
    } catch {
      next = null;
      estimate = null;
    }
    // No status back, whether the request failed or the server could not
    // answer: what is on screen may be out of date.
    if (!next) {
      setMisses((n) => n + 1);
      return;
    }
    setMisses(0);
    setLastCheckedAt(Date.now());
    if (next !== status) {
      setStatus(next);
      // Pickup QR and completed-order content are rendered by the parent server page.
      router.refresh();
    }
    setWait(estimate);
  }, [boothId, orderNumber, token, status, router]);
  usePolling(poll, { intervalMs: POLL_MS, enabled: !isTerminal(status) });

  useReadyAlert(status, boothName, displayNumber);

  // The recent-orders list on the menu page is written before this page knows
  // the number it will show, so tell it once the number is on screen. The
  // token lets it number an order that was recorded before it was paid.
  useEffect(() => {
    noteDisplayNumber(boothId, orderNumber, displayNumber, token);
  }, [boothId, orderNumber, displayNumber, token]);

  const cancelled = status === "cancelled";
  const ready = status === "ready";
  const elapsed =
    nowMs !== null && nowMs !== undefined
      ? elapsedLabel(nowMs - Date.parse(placedAt))
      : null;

  const waiting = !ready && !isTerminal(status);

  // A pending order at a booth that waits for the customer needs their tap to
  // start; a pending order waiting on the vendor's own accept (no printer,
  // 0086) has nothing for the customer to do.
  const needsArrival = status === "pending" && requiresArrivalConfirm;
  const copy = statusCopy(status, {
    needsArrival,
    awaitingPayment,
    paymentSent,
  });

  return (
    <div className="space-y-6 px-6 py-7 text-center">
      {!cancelled && <StageTrack status={status} />}

      <StatusHeadline
        status={status}
        copy={copy}
        misses={misses}
        lastCheckedAt={lastCheckedAt}
      />

      {needsArrival && (
        <Button
          type="button"
          size="lg"
          className="h-14 w-full rounded-xl text-base font-semibold"
          onClick={onConfirmArrival}
          disabled={confirming}
        >
          {confirming ? "Starting…" : "I'm here, start my order"}
        </Button>
      )}

      {waiting && !needsArrival && <WaitEstimate wait={wait} />}

      <ReadyAlerts
        waiting={waiting}
        armed={armed}
        permission={permission}
        requesting={requesting}
        onEnable={onEnableAlerts}
      />

      {/* A finished order's header already stamps when it was placed (see
          PastOrderStamp in page.tsx); saying it twice reads as two times. */}
      {!isTerminal(status) && elapsed && (
        <p className="text-xs text-muted-foreground">Placed {elapsed}</p>
      )}
    </div>
  );
}
