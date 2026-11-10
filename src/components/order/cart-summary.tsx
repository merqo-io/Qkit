"use client";

import { ChevronDown, Minus, Plus, ShoppingCart } from "lucide-react";
import { Button, cn } from "@merqo/ui/primitives";

import { Ticket } from "@/components/widgets/ticket";
import { count, formatOptions, formatPrice } from "@/lib/utils";

import type { useCart } from "@/hooks/use-cart";

interface Props {
  entries: ReturnType<typeof useCart>["entries"];
  itemCount: number;
  total: number;
  priced: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDecrement: (key: string) => void;
  onIncrement: (key: string) => void;
}

export function CartSummary({
  entries: cartEntries,
  itemCount,
  total,
  priced: cartPriced,
  expanded: cartExpanded,
  onToggle,
  onDecrement: decrement,
  onIncrement: increment,
}: Props) {
  return (
    <Ticket as="section" shadow="none" radius="xl">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={cartExpanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <ShoppingCart className="size-3.5" />
          Your order
        </span>
        <span className="flex items-center gap-2 font-mono text-sm font-semibold">
          {count(itemCount, "item")}
          {cartPriced && ` · ${formatPrice(total)}`}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              cartExpanded && "rotate-180",
            )}
          />
        </span>
      </button>
      {cartExpanded && (
        <>
          <div className="perforation mx-4" />
          <div className="space-y-3 px-4 py-3">
            {cartEntries.map(([key, item]) => {
              const options = formatOptions(item.options);
              return (
                <div
                  key={key}
                  className="flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    {options && (
                      <p className="truncate text-xs text-muted-foreground">
                        {options}
                      </p>
                    )}
                    {item.price_cents !== null &&
                      item.price_cents !== undefined && (
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {formatPrice(item.price_cents * item.quantity)}
                        </p>
                      )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-11 rounded-lg"
                      onClick={() => decrement(key)}
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
                      className="size-11 rounded-lg"
                      onClick={() => increment(key)}
                      aria-label={`Increase ${item.name}`}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {cartPriced && (
            <>
              <div className="perforation mx-4" />
              <div className="flex items-baseline justify-between px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total
                </span>
                <span className="font-mono text-lg font-bold">
                  {formatPrice(total)}
                </span>
              </div>
            </>
          )}
        </>
      )}
    </Ticket>
  );
}
