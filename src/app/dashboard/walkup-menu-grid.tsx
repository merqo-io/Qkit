"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@merqo/ui/primitives";

import { cartKey } from "@/lib/cart";
import type { useCart } from "@/hooks/use-cart";
import { remainingFor, type Remaining } from "@/lib/stock";
import { formatPrice, menuItemActionLabel } from "@/lib/utils";
import type { MenuItem } from "@/lib/types";

function MenuMessage({ children }: { children: string }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
  );
}

function MenuItemCard({
  item,
  inCart,
  left,
  onDecrement,
  onIncrement,
  onAddClick,
}: {
  item: MenuItem;
  inCart: { quantity: number } | undefined;
  left: number | null;
  onDecrement: () => void;
  onIncrement: () => void;
  onAddClick: () => void;
}) {
  const hasOptions = !!item.option_groups && item.option_groups.length > 0;
  const soldOut = left !== null && left <= 0;
  let cardTone: string;
  if (soldOut) cardTone = "border-border opacity-60";
  else if (inCart) cardTone = "border-primary/40 bg-primary/[0.04]";
  else cardTone = "border-border";
  return (
    <div
      className={`flex flex-col justify-between gap-2 rounded-xl border p-3 transition-colors ${cardTone}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.name}</p>
        {item.price_cents !== null && item.price_cents !== undefined && (
          <p className="font-mono text-xs text-muted-foreground">
            {formatPrice(item.price_cents)}
          </p>
        )}
        {left !== null && (
          <p className="text-xs text-muted-foreground">
            {soldOut ? "Sold out" : `${left} left`}
          </p>
        )}
      </div>
      {inCart ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 rounded-lg"
            onClick={onDecrement}
            aria-label={`Remove one ${item.name}`}
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="w-5 text-center font-mono text-sm font-bold">
            {inCart.quantity}
          </span>
          <Button
            type="button"
            size="icon"
            className="size-8 rounded-lg"
            onClick={onIncrement}
            aria-label={`Add one ${item.name}`}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full rounded-lg"
          onClick={onAddClick}
          disabled={soldOut}
        >
          {menuItemActionLabel(soldOut, hasOptions)}
        </Button>
      )}
    </div>
  );
}

interface Props {
  boothCount: number;
  loading: boolean;
  menuItems: MenuItem[];
  cart: ReturnType<typeof useCart>["cart"];
  remaining: Remaining;
  onDecrement: (key: string) => void;
  onIncrement: (key: string) => void;
  onAddClick: (item: MenuItem) => void;
}

/** The menu pane's body: the empty and loading messages, or the item cards. */
export function WalkupMenuSection({
  boothCount,
  loading,
  menuItems,
  cart,
  remaining,
  onDecrement,
  onIncrement,
  onAddClick,
}: Props) {
  if (boothCount === 0) {
    return (
      <MenuMessage>
        No open booths to take a walk-up order for. Turn one on first.
      </MenuMessage>
    );
  }
  if (loading) return <MenuMessage>Loading menu…</MenuMessage>;
  if (menuItems.length === 0) {
    return <MenuMessage>This booth has no menu items yet.</MenuMessage>;
  }
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-2">
      {menuItems.map((item) => {
        const hasOptions =
          !!item.option_groups && item.option_groups.length > 0;
        const plainKey = cartKey(item.id);
        return (
          <MenuItemCard
            key={item.id}
            item={item}
            inCart={hasOptions ? undefined : cart.get(plainKey)}
            left={remainingFor(remaining, item.id)}
            onDecrement={() => onDecrement(plainKey)}
            onIncrement={() => onIncrement(plainKey)}
            onAddClick={() => onAddClick(item)}
          />
        );
      })}
    </div>
  );
}
