import type { ReactNode } from "react";
import { Button } from "@merqo/ui/primitives";

import type { BoardOrder, PaymentStatus } from "@/lib/types";
import {
  BATCH_BUTTON,
  SelectButton,
  SelectionBar,
  type useBatchSelection,
} from "./board-batch";
import type { groupVisibleOrders } from "./board-derive";
import { EmptyColumn } from "./board-empty-states";
import {
  OrderSection,
  SectionSwitcher,
  type PhoneSection,
} from "./board-sections";

export interface BatchControls {
  selectMode: boolean;
  preparingIds: string[];
  batchableIds: string[];
  startableIds: string[];
  advancing: boolean;
  paymentById: ReadonlyMap<string, PaymentStatus>;
  advanceSelected: ReturnType<typeof useBatchSelection>["advanceSelected"];
  onStartSelect: () => void;
}

/**
 * Preparing's controls: catch every order still being made up to ready in one
 * tap, and Select. Both step aside while Select is on; its bar has the
 * controls then.
 */
function PreparingAction({ batch }: { batch: BatchControls }) {
  const { preparingIds, advancing, paymentById } = batch;
  return (
    <div className="flex items-center gap-2">
      {preparingIds.length > 1 && (
        <Button
          size="sm"
          className={BATCH_BUTTON}
          disabled={advancing}
          onClick={() =>
            batch.advanceSelected(preparingIds, "preparing", paymentById)
          }
        >
          Mark all {preparingIds.length} ready
        </Button>
      )}
      {preparingIds.length > 0 && (
        <SelectButton onStart={batch.onStartSelect} />
      )}
    </div>
  );
}

function StartAllButton({ batch }: { batch: BatchControls }) {
  const { startableIds } = batch;
  return (
    <Button
      size="sm"
      className={BATCH_BUTTON}
      disabled={batch.advancing}
      onClick={() =>
        batch.advanceSelected(startableIds, "pending", batch.paymentById)
      }
    >
      Start all {startableIds.length}
    </Button>
  );
}

export function BoardColumns({
  incoming,
  preparing,
  ready,
  phoneSection,
  onPhoneSectionChange,
  batch,
  renderCard,
}: {
  incoming: BoardOrder[];
  preparing: BoardOrder[];
  ready: BoardOrder[];
  phoneSection: PhoneSection;
  onPhoneSectionChange: (section: PhoneSection) => void;
  batch: BatchControls;
  renderCard: (order: BoardOrder) => ReactNode;
}) {
  const hide = (section: PhoneSection) => phoneSection !== section;
  return (
    <>
      <SectionSwitcher
        value={phoneSection}
        onChange={onPhoneSectionChange}
        counts={{
          incoming: incoming.length,
          preparing: preparing.length,
          ready: ready.length,
        }}
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <OrderSection
          label="Incoming"
          orders={incoming}
          hiddenOnPhone={hide("incoming")}
          action={
            batch.startableIds.length > 1 && <StartAllButton batch={batch} />
          }
          empty={<EmptyColumn>No new orders</EmptyColumn>}
          renderCard={renderCard}
        />
        <OrderSection
          label="Preparing"
          orders={preparing}
          hiddenOnPhone={hide("preparing")}
          action={!batch.selectMode && <PreparingAction batch={batch} />}
          empty={<EmptyColumn>Nothing being made</EmptyColumn>}
          renderCard={renderCard}
        />
        <OrderSection
          label="Ready"
          orders={ready}
          hiddenOnPhone={hide("ready")}
          action={
            !batch.selectMode &&
            ready.length > 0 && <SelectButton onStart={batch.onStartSelect} />
          }
          empty={<EmptyColumn>Nothing waiting for pickup</EmptyColumn>}
          renderCard={renderCard}
        />
      </div>
    </>
  );
}

export function BoardSelectionBar({
  batch,
  groups,
}: {
  batch: ReturnType<typeof useBatchSelection>;
  groups: ReturnType<typeof groupVisibleOrders>;
}) {
  if (!batch.selectMode) return null;
  const { tickedPreparing, tickedReady, paymentById } = groups;
  return (
    <SelectionBar
      readyCount={tickedPreparing.length}
      pickupCount={tickedReady.length}
      allSelected={groups.allSelected}
      busy={batch.advancing}
      onCancel={() => {
        batch.setSelectMode(false);
        batch.setSelectedIds(new Set());
      }}
      onToggleAll={() =>
        batch.setSelectedIds(
          groups.allSelected ? new Set() : new Set(groups.batchableIds),
        )
      }
      onMarkReady={() =>
        batch.advanceSelected(tickedPreparing, "preparing", paymentById)
      }
      onMarkPickedUp={() =>
        batch.advanceSelected(tickedReady, "ready", paymentById)
      }
    />
  );
}
