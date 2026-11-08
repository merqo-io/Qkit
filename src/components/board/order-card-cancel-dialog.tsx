"use client";

import { ConfirmDialog } from "@merqo/ui";

/**
 * Opened from the ticket's "more" menu. An auto-completed order gets its own
 * wording: the auto-clear sweep can beat a vendor's own cancel tap, and
 * cancelOrder accepts that case specifically (see its own comment).
 */
export function CancelOrderDialog({
  open,
  onOpenChange,
  number,
  closed,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  number: string | null;
  closed: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancel order #${number}?`}
      description={
        closed
          ? "This order was auto-completed before you cancelled it. Cancelling now permanently removes it from the board. This can't be undone."
          : "This permanently cancels the order and removes it from the board. This can't be undone."
      }
      confirmLabel="Cancel order"
      cancelLabel="Keep order"
      variant="destructive"
      errorMessage="Could not cancel the order. Try again."
      onConfirm={onConfirm}
    />
  );
}
