"use client";

import { cn } from "@merqo/ui/primitives";
import { useState } from "react";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { useCupsToday } from "@/hooks/use-cups-today";
import type { NumberingBaselines } from "@/lib/numbering-baselines";
import type { OptionCodes } from "@/lib/ticket";
import { overtakenOrderIds, type AgeSortOrder } from "@/lib/orders";
import { boothColors } from "@/lib/booth/color";
import { WalkupOrderDialog } from "./walkup-order-dialog";
import { useBatchSelection } from "./board-batch";
import {
  BoothRow,
  resolveBoothFilter,
  type BoothFilter,
  type BoothView,
} from "./board-booths";
import {
  LoadErrorBanner,
  NumbersDegradedBanner,
  type PhoneSection,
} from "./board-sections";
import { BoardHeader } from "./board-header";
import { BoothStatusDialog } from "./board-booth-dialog";
import { BoardFilterBar } from "./board-filter-bar";
import { BoardColumns, BoardSelectionBar } from "./board-columns";
import { renderBoardCard } from "./board-card-renderer";
import {
  activeOrders,
  groupVisibleOrders,
  walkupStartBoothId,
} from "./board-derive";
import {
  AllCaughtUp,
  DisconnectedBanner,
  NoBoothsState,
} from "./board-empty-states";
import { useBoothActive } from "./use-booth-active";
import {
  useOrderSweeps,
  useUndoWindowIds,
  useWalkupAutoOpen,
} from "./use-board-lifecycle";
import { useBoardNumbering } from "./use-board-numbering";
import { useNewOrderAlerts } from "./use-new-order-alerts";

import type { BoardOrder, BoardSettings } from "@/lib/types";

interface Props {
  booths: BoothView[];
  initialOrders: BoardOrder[];
  boardSettings: BoardSettings;
  // The initial server-side read errored, so the board may be missing in-flight
  // orders. Warn instead of silently showing "All clear".
  loadError?: boolean;
  // The numbering read failed, so displayed order numbers may be wrong.
  numbersDegraded?: boolean;
  // Each booth's day and per-service baselines, keyed by booth id. Only
  // populated (by the server page) when boardSettings.daily_order_number_reset
  // is on. A booth is missing from it when it had no order yet at page load;
  // the board then falls back to the first number it sees live (see
  // useBoardNumbering). With the setting off the map stays empty and no
  // fallback is computed, so every card shows its real, permanent number.
  dailyOrderNumberBaselines?: Record<string, NumberingBaselines>;
  // The SGT day start (ISO) the server computed those baselines for. Once the
  // board's own day rolls past it, they describe yesterday and are ignored.
  baselinesDayStart?: string;
  // Each booth's ISO "Start new service" times today, ascending, keyed by booth
  // id. Orders rank from the latest start at or before them.
  serviceStarts?: Record<string, string[]>;
  // Each booth's short codes for option choices, keyed by booth id (see
  // buildOptionCodes in @/lib/ticket). A booth with none is simply absent, and
  // its tickets print every choice in full.
  optionCodes?: Record<string, OptionCodes>;
}

export function RealtimeOrderBoard({
  booths,
  initialOrders,
  boardSettings,
  loadError = false,
  numbersDegraded = false,
  dailyOrderNumberBaselines = {},
  baselinesDayStart,
  serviceStarts = {},
  optionCodes = {},
}: Props) {
  const boothIds = booths.map((b) => b.id);
  const boothName = new Map(booths.map((b) => [b.id, b.name]));
  // By place in the full booth list (oldest first), not the filtered one, so
  // a booth keeps its colour whatever the filter shows.
  const boothColor = boothColors(boothIds);
  const [filter, setFilter] = useState<BoothFilter>("all");
  const [sortOrder, setSortOrder] = useState<AgeSortOrder>("earliest");
  const [phoneSection, setPhoneSection] = useState<PhoneSection>("incoming");
  const [walkupOpen, setWalkupOpen] = useState(false);
  const [boothDialogOpen, setBoothDialogOpen] = useState(false);
  const { boothIsActive, setBoothActive, activeBoothCount } =
    useBoothActive(booths);
  const { undoWindowIds, handleUndoWindowChange } = useUndoWindowIds();
  const batch = useBatchSelection();
  useWalkupAutoOpen(booths, () => setWalkupOpen(true));
  useOrderSweeps(boardSettings);
  const alerts = useNewOrderAlerts({ boothName, boardSettings });

  // Each capped booth's item count, re-read as its orders change so the
  // booth row's "N/cap items" follows a rush without a reload.
  const { withLiveCount, refreshCups } = useCupsToday(booths);
  const { orders, status: liveStatus } = useRealtimeOrders(
    boothIds,
    initialOrders,
    alerts.handleNewOrder,
    refreshCups,
  );
  const numbering = useBoardNumbering({
    orders,
    boardSettings,
    baselinesDayStart,
    serviceStarts,
    dailyOrderNumberBaselines,
    newOrderNumberRef: alerts.newOrderNumberRef,
  });

  const active = activeOrders(orders, undoWindowIds, sortOrder);
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
  if (booths.length === 0) {
    return <NoBoothsState loadError={loadError} />;
  }

  const idle = visible.length === 0;
  const groups = groupVisibleOrders(visible, booths, batch.selectedIds);
  const soleBooth = booths.length === 1 ? booths[0] : undefined;
  const renderCard = renderBoardCard.bind(null, {
    baselinesByBooth: numbering.baselinesByBooth,
    dayStartIso: numbering.dayStartIso,
    // Ids of orders a later one has already overtaken: still in progress while
    // something ordered after them is out (see overtakenOrderIds). Computed
    // over the whole realtime list, not just `active`, so a ready order that
    // has since been cleared off the board still counts as having overtaken
    // the ones before it.
    overtaken: overtakenOrderIds(orders),
    optionCodes,
    multiBooth,
    boothName,
    boothColor,
    boardSettings,
    onUndoWindowChange: handleUndoWindowChange,
    selectMode: batch.selectMode,
    selectedIds: batch.selectedIds,
    onToggleSelect: batch.toggleSelect,
    waitsForArrival: groups.waitsForArrival,
  });

  return (
    // Room under the last ticket for the selection bar, which floats over the
    // bottom of the board while Select is on. Enough for the bar wrapped to two
    // rows of touch-sized buttons on a phone.
    <div className={cn(batch.selectMode && "pb-40")}>
      {loadError && <LoadErrorBanner />}
      {numbersDegraded && <NumbersDegradedBanner />}
      {liveStatus === "disconnected" && <DisconnectedBanner />}
      <BoardHeader
        booths={booths}
        selectedBooth={selectedBooth}
        activeBoothCount={activeBoothCount}
        boothIsActive={boothIsActive}
        onToggleBooth={setBoothActive}
        onOpenBoothDialog={() => setBoothDialogOpen(true)}
        onNewOrder={() => setWalkupOpen(true)}
        idle={idle}
        visibleCount={visible.length}
      />

      {/* A single-booth vendor gets the pause/resume switch inline — no
          point wrapping one switch in a dialog. Two-plus booths go behind
          the "Booths" header button instead (see BoothStatusDialog). */}
      {soleBooth && (
        <div className="mb-6 max-w-sm">
          <BoothRow
            b={withLiveCount(soleBooth)}
            color={boothColor.get(soleBooth.id)}
            showDot={false}
            active={boothIsActive(soleBooth)}
            onToggle={(checked) => setBoothActive(soleBooth, checked)}
            onServiceStarted={numbering.recordServiceStart}
          />
        </div>
      )}

      <BoothStatusDialog
        open={boothDialogOpen}
        onOpenChange={setBoothDialogOpen}
        booths={booths}
        withLiveCount={withLiveCount}
        boothColor={boothColor}
        boothIsActive={boothIsActive}
        onToggle={setBoothActive}
        onServiceStarted={numbering.recordServiceStart}
      />

      <BoardFilterBar
        multiBooth={multiBooth}
        effectiveFilter={effectiveFilter}
        onFilterChange={setFilter}
        visibleBooths={visibleBooths}
        activeTotal={active.length}
        activeCountFor={activeCountFor}
        boothColor={boothColor}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
      />

      {idle ? (
        <AllCaughtUp />
      ) : (
        <BoardColumns
          incoming={groups.incoming}
          accepted={groups.accepted}
          phoneSection={phoneSection}
          onPhoneSectionChange={setPhoneSection}
          batch={{
            ...groups,
            selectMode: batch.selectMode,
            advancing: batch.advancing,
            advanceSelected: batch.advanceSelected,
            onStartSelect: () => batch.setSelectMode(true),
          }}
          renderCard={renderCard}
        />
      )}

      <BoardSelectionBar batch={batch} groups={groups} />

      <WalkupOrderDialog
        open={walkupOpen}
        onOpenChange={setWalkupOpen}
        booths={booths.filter(boothIsActive)}
        initialBoothId={walkupStartBoothId(
          booths,
          effectiveFilter,
          boothIsActive,
        )}
        displayNumber={numbering.newOrderNumber}
        onPlacing={alerts.handleWalkupPlacing}
        onPlaced={alerts.handleWalkupPlaced}
      />
    </div>
  );
}
