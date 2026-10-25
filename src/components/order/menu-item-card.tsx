"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZoomableImage } from "@/components/widgets/zoomable-image";
import { AllergenBadges } from "@/components/order/allergen-badges";
import { cn, formatPrice, menuItemActionLabel } from "@/lib/utils";
import type { MenuItem } from "@/lib/types";

// What the item card says under the price when the item's stock is finite.
function StockNote({ left, held }: { left: number | null; held: boolean }) {
  if (left === null) return null;
  if (left <= 0)
    return (
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-status-cancelled">
        Sold out
      </p>
    );
  return (
    <p
      className={cn(
        "mt-1 text-xs font-medium",
        left <= 5
          ? "font-semibold text-status-preparing"
          : "text-muted-foreground",
      )}
    >
      {left} left
      {held && (
        <span className="block text-muted-foreground">
          Also in other baskets. Stock is checked when you order.
        </span>
      )}
    </p>
  );
}

/**
 * One item on the customer's menu: photo, name, price, allergens and stock,
 * with the control that fits it. An item with no options gets "Add" and then
 * a stepper; an item with options opens the customizer, and says how many of
 * it are in the order, since those sit in the basket as separate lines.
 */
export function MenuItemCard({
  item,
  plainQuantity,
  configuredInCart,
  left,
  held,
  closed,
  onAdd,
  onIncrement,
  onDecrement,
}: {
  item: MenuItem;
  // How many of this item are in the basket, for an item with no options;
  // undefined when it is not in the basket or has options.
  plainQuantity: number | undefined;
  // How many of this item are in the basket across its configured lines.
  configuredInCart: number;
  // Stock left; null when the item has no limit.
  left: number | null;
  // Some of that stock sits in other customers' baskets.
  held: boolean;
  closed: boolean;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const hasOptions = !!item.option_groups && item.option_groups.length > 0;
  const soldOut = left !== null && left <= 0;
  let cardTone: string;
  if (soldOut) cardTone = "border-border opacity-60";
  else if (plainQuantity !== undefined || configuredInCart > 0)
    cardTone = "border-primary/40 bg-primary/[0.04]";
  else cardTone = "border-border";
  const addLabel = menuItemActionLabel(soldOut, hasOptions);
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl border bg-card p-3.5 transition-colors ${cardTone}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {item.image_url && (
          <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border">
            <ZoomableImage
              src={item.image_url}
              alt={item.name}
              sizes="3.5rem"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-medium break-words">{item.name}</h3>
          {item.description && (
            <p className="line-clamp-2 text-sm break-words text-muted-foreground">
              {item.description}
            </p>
          )}
          {item.price_cents !== null && item.price_cents !== undefined && (
            <p className="mt-1 font-mono text-sm font-semibold text-primary">
              {formatPrice(item.price_cents)}
            </p>
          )}
          <AllergenBadges tags={item.allergens ?? []} />
          <StockNote left={left} held={held} />
          {configuredInCart > 0 && (
            <p className="mt-1 text-xs font-semibold text-primary">
              {configuredInCart} in your order
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {plainQuantity !== undefined ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 rounded-lg"
              onClick={onDecrement}
              aria-label={`Remove one ${item.name}`}
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="w-5 text-center font-mono text-sm font-bold">
              {plainQuantity}
            </span>
            <Button
              type="button"
              size="icon"
              className="size-11 rounded-lg"
              onClick={onIncrement}
              aria-label={`Add one ${item.name}`}
            >
              <Plus className="size-3.5" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 rounded-lg px-4"
            onClick={onAdd}
            disabled={closed || soldOut}
          >
            {addLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
