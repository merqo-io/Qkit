"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Button, Input, Label } from "@merqo/ui/primitives";

import type { useCart } from "@/hooks/use-cart";
import { count, formatOptions, formatPrice } from "@/lib/utils";

function CartLines({
  entries,
  onDecrement,
  onIncrement,
  priced,
  total,
}: {
  entries: ReturnType<typeof useCart>["entries"];
  onDecrement: (key: string) => void;
  onIncrement: (key: string) => void;
  priced: boolean;
  total: number;
}) {
  return (
    <div className="space-y-3">
      {entries.map(([key, item]) => {
        const options = formatOptions(item.options);
        return (
          <div key={key} className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              {options && (
                <p className="truncate text-xs text-muted-foreground">
                  {options}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7 rounded-lg"
                onClick={() => onDecrement(key)}
                aria-label={`Decrease ${item.name}`}
              >
                <Minus className="size-3" />
              </Button>
              <span className="w-4 text-center font-mono text-sm font-bold">
                {item.quantity}
              </span>
              <Button
                type="button"
                size="icon"
                className="size-7 rounded-lg"
                onClick={() => onIncrement(key)}
                aria-label={`Increase ${item.name}`}
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </div>
        );
      })}
      {priced && (
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Total
          </span>
          <span className="font-mono text-lg font-bold">
            {formatPrice(total)}
          </span>
        </div>
      )}
    </div>
  );
}

interface Props {
  entries: ReturnType<typeof useCart>["entries"];
  itemCount: number;
  total: number;
  priced: boolean;
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  expectsPayment: boolean;
  submitLabel: string;
  submitDisabled: boolean;
  onDecrement: (key: string) => void;
  onIncrement: (key: string) => void;
  onSubmit: () => void;
}

/** The order summary pane: cart lines, customer name and the submit button. */
export function WalkupOrderSummary({
  entries,
  itemCount,
  total,
  priced,
  customerName,
  onCustomerNameChange,
  expectsPayment,
  submitLabel,
  submitDisabled,
  onDecrement,
  onIncrement,
  onSubmit,
}: Props) {
  const hasItems = entries.length > 0;
  return (
    <div className="flex flex-col border-t border-border md:w-72 md:shrink-0 md:overflow-y-auto md:border-t-0 md:border-l">
      <div className="flex-1 space-y-4 p-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          <ShoppingCart className="size-3.5" />
          Order{hasItems && ` (${count(itemCount, "item")})`}
        </h2>

        {hasItems ? (
          <CartLines
            entries={entries}
            onDecrement={onDecrement}
            onIncrement={onIncrement}
            priced={priced}
            total={total}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No items yet. Tap items on the left to add them.
          </p>
        )}

        <div className="space-y-1.5">
          <Label
            htmlFor="walkup-customer-name"
            className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
          >
            Customer name
          </Label>
          <Input
            id="walkup-customer-name"
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            placeholder="Walk-up"
            className="h-10 rounded-xl"
            maxLength={100}
          />
        </div>

        {/* A free order has nothing to collect, so no payment step
            follows it (see pendingPayment in walkup-actions). */}
        {expectsPayment && total > 0 && (
          <p className="text-xs text-muted-foreground">
            Payment comes next. After you add the order, this screen shows the
            amount and your payment QR for the customer.
          </p>
        )}
      </div>

      <div className="border-t border-border p-4">
        <Button
          type="button"
          size="lg"
          className="h-12 w-full rounded-xl font-semibold"
          disabled={submitDisabled}
          onClick={onSubmit}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
