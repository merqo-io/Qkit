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
 * The Accepted column's own controls: catch every order still being made up
 * to ready in one tap (pick-up stays one at a time, or through Select, since
 * customers collect one by one), and Select itself. Both step aside while
 * Select is on; its bar has the controls then.
 */
function AcceptedAction({ batch }: { batch: BatchControls }) {
  const { preparingIds, batchableIds, advancing, paymentById } = batch;
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
      {batchableIds.length > 0 && (
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
  accepted,
  phoneSection,
  onPhoneSectionChange,
  batch,
  renderCard,
}: {
  incoming: BoardOrder[];
  accepted: BoardOrder[];
  phoneSection: PhoneSection;
  onPhoneSectionChange: (section: PhoneSection) => void;
  batch: BatchControls;
  renderCard: (order: BoardOrder) => ReactNode;
}) {
  return (
    <>
      {incoming.length > 0 && accepted.length > 0 && (
        <SectionSwitcher
          value={phoneSection}
          onChange={onPhoneSectionChange}
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
            hiddenOnPhone={accepted.length > 0 && phoneSection !== "incoming"}
            action={
              batch.startableIds.length > 1 && <StartAllButton batch={batch} />
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
            action={!batch.selectMode && <AcceptedAction batch={batch} />}
            hiddenOnPhone={incoming.length > 0 && phoneSection !== "accepted"}
            renderCard={renderCard}
          />
        )}
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
