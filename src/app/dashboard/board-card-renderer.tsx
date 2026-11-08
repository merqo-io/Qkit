import { OrderCard } from "@/components/board/order-card";
import {
  baselineFor,
  type NumberingBaselines,
} from "@/lib/numbering-baselines";
import { displayOrderNumber } from "@/lib/orders";
import type { OptionCodes } from "@/lib/ticket";
import type { BoardOrder, BoardSettings } from "@/lib/types";
import { isNil } from "@/lib/utils";
import { isBatchable } from "./board-batch";

export interface CardRenderContext {
  baselinesByBooth: Record<string, NumberingBaselines>;
  dayStartIso: string;
  overtaken: ReadonlySet<string>;
  optionCodes: Record<string, OptionCodes>;
  multiBooth: boolean;
  boothName: Map<string, string>;
  boothColor: Map<string, string>;
  boardSettings: BoardSettings;
  onUndoWindowChange: (orderId: string, active: boolean) => void;
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  waitsForArrival: ReadonlySet<string>;
}

function readyAutoClearMs(boardSettings: BoardSettings) {
  const min = boardSettings.ready_auto_clear_min;
  return min !== null && min !== undefined ? min * 60_000 : null;
}

export function renderBoardCard(ctx: CardRenderContext, order: BoardOrder) {
  if (isNil(order.order_number)) return null;
  const { boardSettings } = ctx;
  return (
    <OrderCard
      key={order.id}
      order={order}
      displayNumber={displayOrderNumber(
        order.order_number,
        baselineFor(
          order.created_at,
          ctx.baselinesByBooth[order.booth_id],
          ctx.dayStartIso,
        ),
      )}
      overtaken={ctx.overtaken.has(order.id)}
      optionCodes={ctx.optionCodes[order.booth_id]}
      boothName={ctx.multiBooth ? ctx.boothName.get(order.booth_id) : undefined}
      boothColor={ctx.boothColor.get(order.booth_id)}
      agingMin={boardSettings.aging_min}
      overdueMin={boardSettings.overdue_min}
      undoMs={boardSettings.undo_seconds * 1000}
      readyAutoClearMs={readyAutoClearMs(boardSettings)}
      onUndoWindowChange={ctx.onUndoWindowChange}
      selectable={ctx.selectMode && isBatchable(order)}
      selected={ctx.selectedIds.has(order.id)}
      onToggleSelect={ctx.onToggleSelect}
      awaitingArrival={
        order.status === "pending" && ctx.waitsForArrival.has(order.booth_id)
      }
    />
  );
}
