"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Plus,
  Settings as SettingsIcon,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { useCupsToday } from "@/hooks/use-cups-today";
import { sgtStartOfDayIso } from "@/lib/tz";
import type { OptionCodes } from "@/lib/ticket";
import { OrderCard } from "@/components/board/order-card";
import { Ticket } from "@/components/widgets/ticket";
import {
  displayOrderNumber,
  needsPaymentReview,
  overtakenOrderIds,
  isTerminal,
  sortActiveOrders,
  type AgeSortOrder,
} from "@/lib/orders";
import { boothColors, boothDotTitle } from "@/lib/booth/color";
import { fireNewOrderNotification, playSound } from "@/lib/order-alerts";
import { toggleBoothActive } from "./booths/actions";
import { sweepReadyOrders, sweepAbandonedPayments } from "./order-actions";
import { WalkupOrderDialog } from "./walkup-order-dialog";
import { SegmentedControl } from "@/components/widgets/segmented-control";
import { CustomerScreenButton } from "./customer-screen-dialog";
import {
  BATCH_BUTTON,
  SelectButton,
  SelectionBar,
  isBatchable,
  useBatchSelection,
} from "./board-batch";
import {
  BoothRow,
  BoothToggle,
  boothFilterLabel,
  resolveBoothFilter,
  type BoothFilter,
  type BoothView,
} from "./board-booths";
import {
  LoadErrorBanner,
  OrderSection,
  SectionSwitcher,
  type PhoneSection,
} from "./board-sections";
import { cn } from "@/lib/utils";
import type { BoardOrder, BoardSettings } from "@/lib/types";

interface Props {
  booths: BoothView[];
  initialOrders: BoardOrder[];
  boardSettings: BoardSettings;
  // The initial server-side read errored — the board may be missing in-flight
  // orders, so warn instead of silently showing "All clear".
  loadError?: boolean;
  // Each booth's first order_number of the SGT day, keyed by booth id — only
  // populated (by the server page) when boardSettings.daily_order_number_reset
  // is on. A booth is missing from it when it had no order yet at page load;
  // the board then falls back to the first number it sees live (see
  // seenFirstNumbers). With the setting off the map stays empty and no fallback
  // is computed, so every card shows its real, permanent number.
  dailyOrderNumberBaselines?: Record<string, string>;
  // Each booth's short codes for option choices, keyed by booth id (see
  // buildOptionCodes in @/lib/ticket). A booth with none is simply absent, and
  // its tickets print every choice in full.
  optionCodes?: Record<string, OptionCodes>;
}

const SORT_ORDERS: { value: AgeSortOrder; label: string }[] = [
  { value: "earliest", label: "Earliest" },
  { value: "latest", label: "Latest" },
];
const HEADER_BUTTON = "rounded-full";

/**
 * "New orders while away" tab-title badge: bumps a counter when the vendor's
 * tab is hidden, clears it the moment they look back, and reflects the count
 * in the tab title so a backgrounded vendor notices. Restores the original
 * title (captured post-hydration) once cleared. Returns the bump function —
 * the count itself is purely a tab-title side effect, never rendered.
 */
function useAwayBadge(): () => void {
  const [away, setAway] = useState(0);
  const originalTitle = useRef("");

  useEffect(() => {
    originalTitle.current = document.title;
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setAway(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (away > 0) document.title = `(${away}) New orders · qkit`;
    else if (originalTitle.current) document.title = originalTitle.current;
  }, [away]);

  return useCallback(() => setAway((n) => n + 1), []);
}

export function RealtimeOrderBoard({
  booths,
  initialOrders,
  boardSettings,
  loadError = false,
  dailyOrderNumberBaselines = {},
  optionCodes = {},
}: Props) {
  const router = useRouter();
  const boothIds = booths.map((b) => b.id);
  const boothName = new Map(booths.map((b) => [b.id, b.name]));
  // By place in the full booth list (oldest first), not the filtered one, so
  // a booth keeps its colour whatever the filter shows.
  const boothColor = boothColors(booths.map((b) => b.id));
  const [filter, setFilter] = useState<BoothFilter>("all");
  const [sortOrder, setSortOrder] = useState<AgeSortOrder>("earliest");
  const [phoneSection, setPhoneSection] = useState<PhoneSection>("incoming");
  // Optimistic is_active overrides, keyed by booth id — instant toggle
  // feedback ahead of the server round-trip/router.refresh(). Deliberately
  // keyed on the FULL `booths` prop, not visibleBooths: a paused booth with
  // no orders in flight drops out of visibleBooths (see below), which would
  // otherwise make it impossible to find and turn back on.
  const [activeOverrides, setActiveOverrides] = useState<Map<string, boolean>>(
    new Map(),
  );
  function boothIsActive(b: BoothView) {
    return activeOverrides.get(b.id) ?? b.is_active;
  }
  // Instant toggle, no confirm gate — same instant-tap-plus-undo pattern as
  // OrderCard's advance buttons, for the same reason (a vendor pausing to
  // clear a rush-hour backlog needs this fast and reversible, not gated
  // behind a dialog). Also doubles as its own Undo handler (called with the
  // pre-toggle value).
  function setBoothActive(b: BoothView, active: boolean) {
    setActiveOverrides((prev) => new Map(prev).set(b.id, active));
    void (async () => {
      try {
        const res = await toggleBoothActive(b.id, active);
        if (!res.success) {
          toast.error(res.error);
          setActiveOverrides((prev) => new Map(prev).set(b.id, !active));
          return;
        }
        toast(active ? `${b.name} is open for orders` : `${b.name} is paused`, {
          action: { label: "Undo", onClick: () => setBoothActive(b, !active) },
        });
        router.refresh();
      } catch {
        setActiveOverrides((prev) => new Map(prev).set(b.id, !active));
        toast.error("Could not update the booth. Refresh to check its status.");
      }
    })();
  }
  const activeBoothCount = booths.filter(boothIsActive).length;
  const soleBooth = booths.length === 1 ? booths[0] : undefined;

  // Order ids currently inside an OrderCard undo window (see order-card.tsx) —
  // kept on the active board below even once their status is terminal, so the
  // undo affordance a vendor just tapped doesn't get yanked out from under
  // them by the realtime echo of the very write it's offering to undo.
  const [undoWindowIds, setUndoWindowIds] = useState<Set<string>>(new Set());
  const handleUndoWindowChange = useCallback(
    (orderId: string, active: boolean) => {
      setUndoWindowIds((prev) => {
        if (active === prev.has(orderId)) return prev;
        const next = new Set(prev);
        if (active) next.add(orderId);
        else next.delete(orderId);
        return next;
      });
    },
    [],
  );
  const {
    selectMode,
    setSelectMode,
    selectedIds,
    setSelectedIds,
    toggleSelect,
    advancing,
    advanceSelected,
  } = useBatchSelection();
  const [walkupOpen, setWalkupOpen] = useState(false);
  const [boothDialogOpen, setBoothDialogOpen] = useState(false);
  const bumpAway = useAwayBadge();

  // Event-mode setup (migration 0080): a booth with walkup_default=true
  // means staff enter every order directly, so open the walk-up dialog the
  // moment the board loads instead of waiting for a "New order" tap — the
  // QR/menu-first board underneath is unaffected either way, and a vendor
  // with no such booth (every booth today) never triggers this. Runs once
  // on mount only, so closing the dialog doesn't reopen it on a later
  // render (e.g. after toggling a booth active/inactive). Only an ACTIVE
  // booth counts: a walk-up booth that is switched off (last weekend's event,
  // a booth kept for testing) is not being served from, and used to pop this
  // dialog over the board on every load anyway.
  const autoOpenedWalkup = useRef(false);
  useEffect(() => {
    if (autoOpenedWalkup.current) return;
    if (booths.some((b) => b.walkup_default && b.is_active)) {
      autoOpenedWalkup.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWalkupOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The ticket number for an order that has just arrived. Set further down,
  // once the day's numbering is known: handleNewOrder has to exist before the
  // orders that numbering is read from.
  const newOrderNumberRef = useRef(
    (_boothId: string, orderNumber: string) => orderNumber,
  );

  function handleNewOrder(order: BoardOrder) {
    if (order.order_number == null) return;
    const shown = newOrderNumberRef.current(order.booth_id, order.order_number);
    void playSound(boardSettings.sound_id);
    toast(`New order #${shown} · ${order.customer_name}`);
    if (document.hidden) {
      bumpAway();
      if (boardSettings.desktop_notify) {
        void fireNewOrderNotification(
          boothName.get(order.booth_id) ?? "qkit",
          shown,
        );
      }
    }
  }

  // Each capped booth's item count, re-read as its orders change so the
  // booth row's "N/cap items" follows a rush without a reload.
  const { withLiveCount, refreshCups } = useCupsToday(booths);

  const { orders, status: liveStatus } = useRealtimeOrders(
    boothIds,
    initialOrders,
    handleNewOrder,
    refreshCups,
  );

  // dailyOrderNumberBaselines is each booth's first order_number of the SGT
  // day, read once by the server page. It has no entry for a booth that had no
  // order yet when the board was opened, which is the normal case at an event:
  // staff open the board while setting up. Fall back to the lowest
  // order_number this board has seen for the booth, so that window is covered
  // too. Without it the whole service runs on permanent numbers (#0847) while
  // the customer's status page, the TV queue display and the printed label each
  // recompute the daily rank (#001) live per request, and staff call a number
  // no customer is holding.
  // Derived from the full `orders` list, not just the cards on screen: a
  // terminal or hidden pending-payment order still counts towards the day's
  // first number, which is what the server-side query counts too. The list is
  // append-only in practice (useRealtimeOrders merges rather than replaces, and
  // terminal orders are filtered at render), so this does not drift upwards as
  // the day's early orders clear. A realtime DELETE of the day's first order
  // would move it, which no code path in qkit does.
  const seenFirstNumbers = useMemo(() => {
    const lowest: Record<string, string> = {};
    if (!boardSettings.daily_order_number_reset) return lowest;
    // Only today's orders count, the same SGT window the server query uses. An
    // order still in progress from an earlier day would otherwise become the
    // baseline and rebase itself to #001, while the customer's status page, the
    // TV display and the printed label all still show its permanent number.
    const dayStart = Date.parse(sgtStartOfDayIso());
    for (const o of orders) {
      if (o.order_number == null) continue;
      if (Date.parse(o.created_at) < dayStart) continue;
      const seen = lowest[o.booth_id];
      if (seen == null || Number(o.order_number) < Number(seen)) {
        lowest[o.booth_id] = o.order_number;
      }
    }
    return lowest;
  }, [orders, boardSettings.daily_order_number_reset]);

  // Toasts, the desktop notification and the walk-up dialog all name an order
  // the moment it is placed, and used to name it by its permanent number
  // (#0847) while its ticket said #002. An order placed just now with no
  // baseline yet for its booth is the day's first, so it is its own baseline.
  // That shortcut is for a new order only: a ticket carried over from
  // yesterday must keep its permanent number, so the cards do not use it.
  function newOrderNumber(boothId: string, orderNumber: string) {
    const baseline =
      dailyOrderNumberBaselines[boothId] ?? seenFirstNumbers[boothId] ?? null;
    const ownBaseline = boardSettings.daily_order_number_reset
      ? orderNumber
      : null;
    return displayOrderNumber(orderNumber, baseline ?? ownBaseline);
  }
  useEffect(() => {
    newOrderNumberRef.current = newOrderNumber;
  });

  // Auto-clear sweep for stale 'ready' orders (board_settings.
  // ready_auto_clear_min) — a plain periodic tick, not tied to any local
  // state. The board's own realtime channel (useRealtimeOrders above)
  // already reflects whatever this flips, so no client-side merge is
  // needed here.
  usePolling(
    useCallback(async () => {
      await sweepReadyOrders();
    }, []),
    { intervalMs: 30_000, enabled: boardSettings.ready_auto_clear_min != null },
  );

  // Abandoned-payment sweep: cancels pending QR orders older than 30 minutes.
  // Unconditional (no vendor setting gate) — this is baseline hygiene, not an
  // opt-in preference. Separate from the ready-orders sweep since its condition
  // and frequency may differ in the future.
  usePolling(
    useCallback(async () => {
      await sweepAbandonedPayments();
    }, []),
    { intervalMs: 30_000, enabled: true },
  );

  const active = sortActiveOrders(
    orders.filter(
      (o) =>
        (!isTerminal(o.status) || undoWindowIds.has(o.id)) &&
        !(o.payment_status === "pending" && o.source === "qr"),
    ),
    sortOrder,
  );
  // Ids of orders a later one has already overtaken: still in progress while
  // something ordered after them is out (see overtakenOrderIds). Computed over
  // the whole realtime list, not just `active`, so a ready order that has since
  // been cleared off the board still counts as having overtaken the ones before
  // it.
  const overtaken = overtakenOrderIds(orders);

  const activeCountFor = (id: string) =>
    active.filter((o) => o.booth_id === id).length;

  const { visibleBooths, multiBooth, effectiveFilter, selectedBooth } =
    resolveBoothFilter(booths, filter, activeCountFor);
  const visible =
    effectiveFilter === "all"
      ? active
      : active.filter((o) => o.booth_id === effectiveFilter);

  // An empty booth list during a read error is almost certainly the error, not a
  // genuinely booth-less vendor — don't show the "No booths yet" onboarding.
  if (booths.length === 0 && loadError) {
    return <LoadErrorBanner />;
  }

  if (booths.length === 0) {
    return (
      <Ticket
        shadow="none"
        dashed
        className="mx-auto mt-10 max-w-md p-10 text-center"
      >
        <p className="font-display text-2xl font-semibold">No booths yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up a booth to start receiving orders. Once it&apos;s live, every
          order lands here in real time.
        </p>
        <div className="mt-6 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center">
          <Button asChild className="rounded-lg">
            <Link href="/dashboard/booths/new">
              <Plus className="size-4" /> Add your first booth
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-lg">
            <Link href="/dashboard/booths/new?mode=event">
              <CalendarDays className="size-4" /> Set up for an event
            </Link>
          </Button>
        </div>
      </Ticket>
    );
  }

  const idle = visible.length === 0;
  const preparingIds = visible
    .filter((o) => o.status === "preparing")
    .map((o) => o.id);
  const readyIds = visible.filter((o) => o.status === "ready").map((o) => o.id);
  const batchableIds = [...preparingIds, ...readyIds];
  const allSelected = batchableIds.every((id) => selectedIds.has(id));
  // Counted against what is on the board now, not the raw selection: an order
  // ticked while preparing may have been marked ready from another device.
  const tickedPreparing = preparingIds.filter((id) => selectedIds.has(id));
  const tickedReady = readyIds.filter((id) => selectedIds.has(id));
  // What a batch undo hands back to revertOrderAdvance for each order.
  const paymentById = new Map(visible.map((o) => [o.id, o.payment_status]));
  // Split the board so an order the vendor hasn't accepted yet (no printer
  // connected, or the booth waits for the customer's own arrival tap) can't
  // get buried under everything already being worked on.
  const incoming = visible.filter((o) => o.status === "pending");
  const accepted = visible.filter((o) => o.status !== "pending");
  // Incoming orders one tap can start together: nothing to check on them
  // first. An order whose payment is unconfirmed needs a look at its proof,
  // and a booth that waits for the customer's arrival is waiting on purpose.
  const waitsForArrival = new Set(
    booths.filter((b) => b.requires_arrival_confirm).map((b) => b.id),
  );
  const startableIds = incoming
    .filter(
      (o) =>
        !needsPaymentReview(o.status, o.payment_status) &&
        !waitsForArrival.has(o.booth_id),
    )
    .map((o) => o.id);

  function renderCard(order: BoardOrder) {
    if (order.order_number == null) return null;
    return (
      <OrderCard
        key={order.id}
        order={order}
        displayNumber={displayOrderNumber(
          order.order_number,
          dailyOrderNumberBaselines[order.booth_id] ??
            seenFirstNumbers[order.booth_id] ??
            null,
        )}
        overtaken={overtaken.has(order.id)}
        optionCodes={optionCodes[order.booth_id]}
        boothName={multiBooth ? boothName.get(order.booth_id) : undefined}
        boothColor={boothColor.get(order.booth_id)}
        agingMin={boardSettings.aging_min}
        overdueMin={boardSettings.overdue_min}
        undoMs={boardSettings.undo_seconds * 1000}
        readyAutoClearMs={
          boardSettings.ready_auto_clear_min != null
            ? boardSettings.ready_auto_clear_min * 60_000
            : null
        }
        onUndoWindowChange={handleUndoWindowChange}
        selectable={selectMode && isBatchable(order)}
        selected={selectedIds.has(order.id)}
        onToggleSelect={toggleSelect}
      />
    );
  }

  function cancelSelect() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // The Accepted column's own controls: catch every order still being made up
  // to ready in one tap (pick-up stays one at a time, or through Select, since
  // customers collect one by one), and Select itself. Both step aside while
  // Select is on; its bar has the controls then.
  const acceptedAction = !selectMode && (
    <div className="flex items-center gap-2">
      {preparingIds.length > 1 && (
        <Button
          size="sm"
          className={BATCH_BUTTON}
          disabled={advancing}
          onClick={() =>
            advanceSelected(preparingIds, "preparing", paymentById)
          }
        >
          Mark all {preparingIds.length} ready
        </Button>
      )}
      {batchableIds.length > 0 && (
        <SelectButton onStart={() => setSelectMode(true)} />
      )}
    </div>
  );

  return (
    // Room under the last ticket for the selection bar, which floats over the
    // bottom of the board while Select is on. Enough for the bar wrapped to two
    // rows of touch-sized buttons on a phone.
    <div className={cn(selectMode && "pb-40")}>
      {loadError && <LoadErrorBanner />}
      {liveStatus === "disconnected" && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          Live updates interrupted, reconnecting. New orders may be delayed; the
          board re-syncs automatically once it&apos;s back.
        </div>
      )}
      <div
        data-tour="order-board"
        className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h1 className="font-display text-3xl font-semibold leading-none sm:text-4xl">
            Live orders
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedBooth ? (
            <BoothToggle
              active={boothIsActive(selectedBooth)}
              onChange={(checked) => setBoothActive(selectedBooth, checked)}
              boothName={selectedBooth.name}
            />
          ) : (
            booths.length > 1 && (
              <Button
                variant="outline"
                className={HEADER_BUTTON}
                onClick={() => setBoothDialogOpen(true)}
                aria-label={`Booth status, ${activeBoothCount} of ${booths.length} open`}
              >
                <Store className="size-3.5" />
                {/* One flex child, not four: Button's `gap-2` inserts space
                    between EVERY direct child, so "Booths · "/count/" open"
                    as separate children each got an extra gap stacked on
                    top of their own literal spaces. Wrapping the label in a
                    single span makes gap-2 fire once (icon → label). */}
                <span>
                  <span className="hidden sm:inline">Booths · </span>
                  {activeBoothCount}/{booths.length}
                  <span className="hidden sm:inline"> open</span>
                </span>
              </Button>
            )
          )}
          <CustomerScreenButton
            booths={booths}
            defaultBoothId={selectedBooth?.id}
          />
          <Button
            variant="default"
            className={HEADER_BUTTON}
            onClick={() => setWalkupOpen(true)}
            aria-label="New order"
            data-tour="new-order"
          >
            <Plus className="size-3.5" />
            {/* Same fix as the booth-status button above: one label child,
                not two, so gap-2 doesn't add space between "New" and the
                span on top of the span's own leading space. */}
            <span>
              New<span className="hidden sm:inline"> order</span>
            </span>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="outline"
                size="icon"
                className="hidden rounded-full sm:inline-flex"
              >
                <Link href="/dashboard/settings" aria-label="Board settings">
                  <SettingsIcon className="size-3.5" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Board settings</TooltipContent>
          </Tooltip>
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
              idle
                ? "bg-success/10 text-success"
                : "bg-primary/10 text-primary",
            )}
          >
            <span className="relative flex size-2">
              {!idle && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-2 rounded-full",
                  idle ? "bg-success" : "bg-primary",
                )}
              />
            </span>
            {/* A phone shows the count alone, so the header's controls and
                this stay on one row; "active" is still read out. */}
            {idle ? (
              "All clear"
            ) : (
              <span>
                {visible.length}
                <span className="sr-only sm:not-sr-only"> active</span>
              </span>
            )}
          </span>
        </div>
      </div>

      {/* A single-booth vendor gets the pause/resume switch inline — no
          point wrapping one switch in a dialog. Two-plus booths go behind
          the "Booths" header button instead (see below): a wall of pause
          rows would otherwise wrap across the top of the board and push
          every order card down, worse the more booths there are — exactly
          the clutter problem a modal avoids regardless of booth count. */}
      {booths.length === 1 && soleBooth && (
        <div className="mb-6 max-w-sm">
          <BoothRow
            b={withLiveCount(soleBooth)}
            color={boothColor.get(soleBooth.id)}
            showDot={false}
            active={boothIsActive(soleBooth)}
            onToggle={(checked) => setBoothActive(soleBooth, checked)}
          />
        </div>
      )}

      <Dialog open={boothDialogOpen} onOpenChange={setBoothDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Booth status</DialogTitle>
            <DialogDescription>
              Pause a booth to stop new orders landing without closing it for
              the day. Handy for clearing a rush-hour backlog. Resume anytime.
              Each booth&apos;s coloured dot also marks its tickets and its
              place in the booth filter.
            </DialogDescription>
          </DialogHeader>
          {/* Deliberately keyed on the full `booths` list, not visibleBooths,
              so a paused booth with no orders in flight (which
              visibleBooths would otherwise hide) stays reachable to turn
              back on. Instant toggle + an undo toast, same pattern as
              OrderCard's advance buttons: this needs to be fast and
              reversible, not gated behind a confirm step of its own. */}
          <div className="space-y-2">
            {booths.map((b) => (
              <BoothRow
                key={b.id}
                b={withLiveCount(b)}
                color={boothColor.get(b.id)}
                showDot
                active={boothIsActive(b)}
                onToggle={(checked) => setBoothActive(b, checked)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* A dropdown rather than a tab-per-booth row: a vendor running a
            large event (a dozen-plus booths) would otherwise get a wall of
            pills wrapping across several lines before a single order card is
            visible — the opposite of "one look and staff know what to do".
            A Select scales to any booth count without growing the header. */}
        {multiBooth && (
          <Select value={effectiveFilter} onValueChange={setFilter}>
            <SelectTrigger
              aria-label="Filter by booth"
              className="h-9 rounded-lg text-sm"
            >
              {/* The label is given outright. Left to Radix it is read off
                  the selected item, which is not mounted until the list has
                  been opened once, so the trigger painted empty on load. */}
              <SelectValue>
                {boothFilterLabel(
                  effectiveFilter,
                  visibleBooths,
                  active.length,
                  activeCountFor,
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All booths ({active.length})</SelectItem>
              {visibleBooths.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: boothColor.get(b.id) }}
                    title={boothDotTitle(b.name)}
                  />
                  <span className="truncate">
                    {b.name} ({activeCountFor(b.id)}){!b.open && " · closed"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* Status-agnostic on purpose — a rush-hour vendor triaging "what's
            waited longest" needs an old ready-but-unclaimed order to
            surface too, not stay pinned below every preparing order just
            because of its status. A bumped order still always leads either
            way (see sortActiveOrders). */}
        <SegmentedControl
          ariaLabel="Sort by order age"
          options={SORT_ORDERS}
          value={sortOrder}
          onChange={setSortOrder}
        />
      </div>

      {idle ? (
        <Ticket shadow="none" dashed className="mt-10 py-20 text-center">
          <p className="font-display text-2xl font-semibold">All caught up</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No active orders. Standing by.
          </p>
        </Ticket>
      ) : (
        <>
          {incoming.length > 0 && accepted.length > 0 && (
            <SectionSwitcher
              value={phoneSection}
              onChange={setPhoneSection}
              incomingCount={incoming.length}
              acceptedCount={accepted.length}
            />
          )}
          <div className="grid grid-cols-1 items-start gap-8 sm:grid-cols-2">
            {incoming.length > 0 && (
              <OrderSection
                label="Incoming"
                orders={incoming}
                solo={accepted.length === 0}
                showHeader
                hiddenOnPhone={
                  accepted.length > 0 && phoneSection !== "incoming"
                }
                action={
                  startableIds.length > 1 && (
                    <Button
                      size="sm"
                      className={BATCH_BUTTON}
                      disabled={advancing}
                      onClick={() =>
                        advanceSelected(startableIds, "pending", paymentById)
                      }
                    >
                      Start all {startableIds.length}
                    </Button>
                  )
                }
                renderCard={renderCard}
              />
            )}
            {accepted.length > 0 && (
              <OrderSection
                label="Accepted"
                orders={accepted}
                solo={incoming.length === 0}
                showHeader
                action={acceptedAction}
                hiddenOnPhone={
                  incoming.length > 0 && phoneSection !== "accepted"
                }
                renderCard={renderCard}
              />
            )}
          </div>
        </>
      )}

      {selectMode && (
        <SelectionBar
          readyCount={tickedPreparing.length}
          pickupCount={tickedReady.length}
          allSelected={allSelected}
          busy={advancing}
          onCancel={cancelSelect}
          onToggleAll={() =>
            setSelectedIds(allSelected ? new Set() : new Set(batchableIds))
          }
          onMarkReady={() =>
            advanceSelected(tickedPreparing, "preparing", paymentById)
          }
          onMarkPickedUp={() =>
            advanceSelected(tickedReady, "ready", paymentById)
          }
        />
      )}

      <WalkupOrderDialog
        open={walkupOpen}
        onOpenChange={setWalkupOpen}
        booths={booths.filter(boothIsActive)}
        // With no booth filtered, start on the booth set up for walk-ups, not
        // on whichever booth happens to be listed first.
        initialBoothId={
          effectiveFilter !== "all"
            ? effectiveFilter
            : booths.find((b) => b.walkup_default && boothIsActive(b))?.id
        }
        displayNumber={newOrderNumber}
      />
    </div>
  );
}
