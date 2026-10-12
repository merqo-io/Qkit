"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Banknote, ImageIcon, MoreHorizontal, Undo2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { parseOrderItems } from "@/lib/schemas";
import { formatPrice } from "@/lib/utils";
import { ADVANCE, isTerminal, needsPaymentReview } from "@/lib/orders";
import { ticketOptions, type OptionCodes } from "@/lib/ticket";
import { shortDateTime } from "@/lib/tz";
import type { BoardOrder, OrderStatus, PaymentStatus } from "@/lib/types";

// Heavy (pulls in tesseract.js on demand once opened) — code-split out of the
// board's initial bundle, same next/dynamic pattern as PayPanel.
const PaymentProofViewer = dynamic(() =>
  import("./payment-proof-viewer").then((m) => m.PaymentProofViewer),
);

// Tap-to-expand proof-photo review, factored out of OrderCard's own render to
// keep its cognitive complexity down. Renders only when the caller has
// already established there's a claimed, un-reviewed proof photo to show.
function ProofPhotoTrigger({
  order,
  expanded,
  onToggle,
}: {
  order: BoardOrder;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="px-4 pb-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/40 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
      >
        <ImageIcon className="size-3.5" aria-hidden="true" />
        {expanded ? "Hide payment proof" : "View payment proof"}
      </button>
      {expanded && (
        <div className="mt-2">
          <PaymentProofViewer
            orderId={order.id}
            expectedAmountCents={order.total_cents}
          />
        </div>
      )}
    </div>
  );
}

export type PendingUndo = {
  revertTo: OrderStatus;
  revertFrom: OrderStatus;
  prevPaymentStatus: PaymentStatus;
  // Which action this undo reverts — advanceOrder's plain transition, or
  // confirmPaymentAndStart's merged one, which needs its own revert function
  // (see revertPaymentAndStart's own doc comment for why).
  action: "advance" | "paymentAndStart";
};

/** Dispatch a pending undo to the server action that made the original change. */
// The payment buttons carry the longest labels on the ticket ("Confirm payment
// received" plus the amount). On a narrow card, three across on a tablet, one
// line of that overflowed the button, so these wrap and grow instead: a
// minimum of the usual height, never a fixed one.
export const PAYMENT_BUTTON =
  "h-auto min-h-12 w-full rounded-lg bg-status-payment-claimed py-2 text-left text-base leading-tight font-bold whitespace-normal text-white hover:bg-status-payment-claimed/90";

// The amount owed, set off at the far end of a payment button. Absent for an
// order with no prices, where there is nothing to check.
export function AmountDue({ amount }: { amount: string | null }) {
  if (amount == null) return null;
  return <span className="ml-auto pl-3 font-mono tabular-nums">{amount}</span>;
}

// Everything that is not "the next step" lives behind this, so the ticket
// carries one button and a mis-tap with wet hands lands on nothing
// destructive. Renders nothing when neither action applies.
export function TicketMenu({
  number,
  disabled,
  onBump,
  onCancel,
}: {
  number: string | null;
  disabled: boolean;
  onBump?: () => void;
  onCancel?: () => void;
}) {
  if (!onBump && !onCancel) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-2 size-10 rounded-full text-muted-foreground"
          aria-label={`More actions for order #${number}`}
          disabled={disabled}
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {onBump && (
          <DropdownMenuItem onSelect={onBump} className="py-2.5">
            <Zap className="size-4" aria-hidden="true" />
            Bump to front
          </DropdownMenuItem>
        )}
        {onCancel && (
          <DropdownMenuItem
            onSelect={onCancel}
            className="py-2.5 text-destructive focus:text-destructive"
          >
            Cancel order
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Every customisation is on the ticket with nothing to open: whoever is making
// the order needs all of it, and a collapsed ticket cost a tap per order. They
// are kept short instead, as the vendor's own codes where set (see
// ticketOptions).
export function TicketItems({
  items,
  optionCodes,
  showPrices,
}: {
  items: ReturnType<typeof parseOrderItems>;
  optionCodes?: OptionCodes;
  showPrices: boolean;
}) {
  return (
    <ul className="space-y-2.5 px-4 py-3.5">
      {items.map((item, i) => {
        const options = ticketOptions(item, optionCodes);
        return (
          <li key={i}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-base leading-snug font-medium break-words">
                <span className="font-mono font-bold">{item.quantity}×</span>{" "}
                {item.name}
              </p>
              {showPrices && (
                <span className="shrink-0 font-mono text-sm text-muted-foreground">
                  {item.price_cents == null
                    ? "Free"
                    : formatPrice(item.price_cents * item.quantity)}
                </span>
              )}
            </div>
            {options.length > 0 && (
              <p className="mt-0.5 flex flex-wrap pl-7 text-sm leading-snug font-medium text-foreground/80">
                {options.map((option, j) => (
                  <span
                    key={j}
                    className="break-words after:mx-1.5 after:text-muted-foreground/60 after:content-['·'] last:after:content-none"
                  >
                    {option}
                  </span>
                ))}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The foot of the ticket: at most one next step (or its undo), the payment
// check when money is outstanding, and the history list's date and total.
// Split out of OrderCard so each reads as one concern.
export function TicketActions({
  order,
  status,
  payStatus,
  updating,
  amountDue,
  pendingUndo,
  undoMs,
  remainingAutoClearMs,
  showDate,
  onConfirmPayment,
  onConfirmPaymentAndStart,
  onAdvance,
  onUndo,
  onRestore,
}: {
  order: BoardOrder;
  status: OrderStatus;
  payStatus: PaymentStatus;
  updating: boolean;
  amountDue: string | null;
  pendingUndo: PendingUndo | null;
  undoMs: number;
  remainingAutoClearMs: number | null;
  showDate: boolean;
  onConfirmPayment: () => void;
  onConfirmPaymentAndStart: () => void;
  onAdvance: () => void;
  onUndo: () => void;
  onRestore: () => void;
}) {
  const [proofExpanded, setProofExpanded] = useState(false);
  const closed = isTerminal(status);
  const advance = ADVANCE[status];
  const paymentReviewNeeded = needsPaymentReview(status, payStatus);
  const priced = amountDue != null;

  return (
    <div className="mt-auto">
      {/* Tap-to-expand proof-photo review — only once a customer has
          actually claimed payment (a proof photo only exists then). Covers
          both payment-review button shapes below (the plain confirm button
          and the merged "Mark paid & start" one), since both require
          payStatus === "claimed". */}
      {status !== "cancelled" &&
        payStatus === "claimed" &&
        order.payment_proof_path && (
          <ProofPhotoTrigger
            order={order}
            expanded={proofExpanded}
            onToggle={() => setProofExpanded((v) => !v)}
          />
        )}

      {/* Completed unpaid orders retain settlement; cancelled orders never prompt for payment. */}
      {status !== "cancelled" &&
        status !== "pending" &&
        payStatus === "claimed" && (
          <div className="px-4 pb-3">
            <Button
              className={PAYMENT_BUTTON}
              onClick={onConfirmPayment}
              disabled={updating}
            >
              <Banknote className="size-5" /> Confirm payment received
              <AmountDue amount={amountDue} />
            </Button>
          </div>
        )}
      {status !== "cancelled" &&
        status !== "pending" &&
        payStatus === "pending" && (
          <div className="px-4 pb-3">
            <Button
              size="sm"
              className="h-10 w-full rounded-lg bg-status-payment-claimed font-semibold text-white hover:bg-status-payment-claimed/90"
              onClick={onConfirmPayment}
              disabled={updating}
            >
              Mark as paid
              <AmountDue amount={amountDue} />
            </Button>
          </div>
        )}

      {/* Reconciled "Mark paid & start" review action — see
          paymentReviewNeeded above. */}
      {!closed && paymentReviewNeeded && (
        <div className="px-4 pb-3">
          <Button
            className={PAYMENT_BUTTON}
            onClick={onConfirmPaymentAndStart}
            disabled={updating}
          >
            <Banknote className="size-5" /> Mark paid &amp; start
            <AmountDue amount={amountDue} />
          </Button>
        </div>
      )}

      {/* Stays visible through a pending undo window even once `closed`
          (e.g. a just-completed order) — otherwise the undo affordance
          itself would vanish along with the row. */}
      {(!closed || pendingUndo) &&
        (pendingUndo && status === pendingUndo.revertFrom ? (
          // Instant tap, no confirm gate on the advance itself — this is
          // the recovery path instead: a few seconds to catch a mis-tap,
          // draining left-to-right so the deadline is visible at a glance.
          <div className="px-4 pb-4">
            <Button
              type="button"
              variant="outline"
              className="relative h-12 w-full overflow-hidden rounded-lg text-base font-semibold"
              onClick={onUndo}
              disabled={updating}
            >
              <span
                className="undo-bar absolute inset-y-0 left-0 bg-foreground/10"
                style={{ animationDuration: `${undoMs}ms` }}
                aria-hidden="true"
              />
              <span className="relative flex items-center gap-1.5">
                <Undo2 className="size-4" /> Undo
              </span>
            </Button>
          </div>
        ) : (
          advance &&
          !paymentReviewNeeded && (
            <div className="px-4 pb-4">
              <Button
                className="relative h-12 w-full overflow-hidden rounded-lg text-base font-semibold"
                onClick={onAdvance}
                disabled={updating}
              >
                {remainingAutoClearMs != null && (
                  <span
                    className="autoclear-bar absolute inset-y-0 left-0 bg-black/10"
                    style={{
                      animationDuration: `${remainingAutoClearMs}ms`,
                    }}
                    aria-hidden="true"
                  />
                )}
                <span className="relative">{advance.label}</span>
              </Button>
            </div>
          )
        ))}

      {closed && !pendingUndo && order.auto_completed && (
        <div className="px-4 pb-4">
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full rounded-lg text-base font-semibold"
            onClick={onRestore}
            disabled={updating}
          >
            <Undo2 className="size-4" /> Restore to ready
          </Button>
        </div>
      )}

      {showDate && (
        <div className="flex items-baseline justify-between border-t border-border/60 px-4 py-2.5 font-mono text-xs text-muted-foreground">
          <span>{shortDateTime(order.created_at)}</span>
          {priced && (
            <span className="text-sm font-bold text-foreground">
              {formatPrice(order.total_cents)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
