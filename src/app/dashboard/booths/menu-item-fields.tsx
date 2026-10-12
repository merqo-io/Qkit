"use client";

import { InfoTooltip, MoneyInput } from "@merqo/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProLock } from "@/components/widgets/pro-lock";
import type { MenuItemFormInput } from "@/lib/schemas";
import type { MenuCategory } from "@/lib/types";

// Radix Select reserves "" for "no selection" — a real sentinel stands in
// for "no section" instead.
const NO_CATEGORY = "__none__";

/**
 * Price/cost/sold-out limit/section as one compact row, each
 * field with a persistent label (not just a placeholder, which
 * disappears once filled) and its longer explanation behind a
 * tap-tooltip instead of a permanent caption line, so the row
 * doesn't grow with every item on a long menu. Section wraps
 * onto its own line below Sold-out limit on narrow screens,
 * and just doesn't render as a 4th column when the booth has
 * no sections yet.
 */
export function MenuItemPricingFields({
  item,
  index,
  categories,
  stockCaps,
  onPrice,
  onCost,
  onStock,
  onCategory,
}: {
  item: MenuItemFormInput;
  // The item's position in the list, used only to give each field a unique id.
  index: number;
  categories: MenuCategory[];
  // Whether the vendor's plan includes sold-out limits.
  stockCaps: boolean;
  onPrice: (cents: number | undefined) => void;
  onCost: (cents: number | undefined) => void;
  // The raw text typed into the sold-out limit, parsed by the editor.
  onStock: (raw: string) => void;
  onCategory: (category: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[8rem] flex-1 space-y-1">
        <Label
          htmlFor={`menu-item-${index}-price`}
          className="text-xs font-medium text-muted-foreground"
        >
          Price
        </Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <MoneyInput
            id={`menu-item-${index}-price`}
            placeholder="Optional"
            cents={item.price_cents}
            onCommit={onPrice}
            className="rounded-lg pl-7"
          />
        </div>
      </div>
      <div className="min-w-[8rem] flex-1 space-y-1">
        <div className="flex items-center gap-1">
          <Label
            htmlFor={`menu-item-${index}-cost`}
            className="text-xs font-medium text-muted-foreground"
          >
            Cost
          </Label>
          <InfoTooltip
            content="Private, used only for your profit/margin stats, never shown to customers."
            ariaLabel="About cost"
            trigger="tap"
          />
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <MoneyInput
            id={`menu-item-${index}-cost`}
            placeholder="Optional"
            cents={item.cost_cents}
            onCommit={onCost}
            className="rounded-lg pl-7"
          />
        </div>
      </div>
      {stockCaps ? (
        <div className="min-w-[8rem] flex-1 space-y-1">
          <div className="flex items-center gap-1">
            <Label
              htmlFor={`menu-item-${index}-stock`}
              className="text-xs font-medium text-muted-foreground"
            >
              Sold-out limit
            </Label>
            <InfoTooltip
              content="Orders stop once this many are sold. Leave blank for unlimited."
              ariaLabel="About sold-out limit"
              trigger="tap"
            />
          </div>
          <Input
            id={`menu-item-${index}-stock`}
            inputMode="numeric"
            placeholder="Unlimited"
            value={item.stock == null ? "" : String(item.stock)}
            onChange={(e) => onStock(e.target.value)}
            className="h-9 w-full rounded-lg"
          />
        </div>
      ) : (
        <div className="flex min-w-[8rem] flex-1 items-center gap-2">
          <ProLock feature="stock_cap" label="Pro" />
          <span className="text-xs text-muted-foreground">Sold-out limit</span>
        </div>
      )}
      {categories.length > 0 && (
        <div className="min-w-[8rem] flex-1 space-y-1">
          <Label
            htmlFor={`menu-item-${index}-section`}
            className="text-xs font-medium text-muted-foreground"
          >
            Section
          </Label>
          <Select
            value={item.category ?? NO_CATEGORY}
            onValueChange={(v) => onCategory(v === NO_CATEGORY ? null : v)}
          >
            <SelectTrigger
              id={`menu-item-${index}-section`}
              className="h-9 w-full rounded-lg"
            >
              <SelectValue placeholder="No section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>No section</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label || "Untitled"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
