"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { DataCollectionNotice } from "@merqo/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatOptions, formatPrice } from "@/lib/utils";
import type { useCart } from "@/hooks/use-cart";

export type CheckoutFormValues = {
  customerName: string;
  customerPhone?: string;
};

/**
 * Where focus lands when the checkout sheet opens. With a mouse or keyboard
 * it goes to the name field, the one thing the sheet asks for. On a touch
 * screen that would raise the keyboard over the order and the button before
 * the customer has read either, so focus goes to the sheet itself and the
 * keyboard waits for a tap.
 */
function focusCheckoutSheet(event: Event) {
  event.preventDefault();
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const target = touch
    ? event.currentTarget
    : document.getElementById("customerName");
  if (target instanceof HTMLElement) target.focus();
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: ReturnType<typeof useCart>["entries"];
  hasItems: boolean;
  priced: boolean;
  total: number;
  paysInPerson: boolean;
  closed: boolean;
  submitting: boolean;
  submitError: string | null;
  confirmLabel: string;
  onSubmit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  register: UseFormRegister<CheckoutFormValues>;
  errors: FieldErrors<CheckoutFormValues>;
}

export function CheckoutSheet({
  open,
  onOpenChange,
  entries: cartEntries,
  hasItems,
  priced: cartPriced,
  total,
  paysInPerson,
  closed,
  submitting,
  submitError,
  confirmLabel,
  onSubmit,
  register,
  errors,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col gap-0 overflow-hidden rounded-t-2xl p-0"
        onOpenAutoFocus={focusCheckoutSheet}
      >
        <SheetHeader className="shrink-0 gap-1 pt-5 pb-3">
          <SheetTitle className="font-display text-xl font-semibold">
            Who&apos;s this for?
          </SheetTitle>
          <SheetDescription className="sr-only">
            Add your name to confirm this order.
          </SheetDescription>
        </SheetHeader>

        {hasItems && (
          <>
            <div className="perforation shrink-0" />
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-2.5">
              {cartEntries.map(([key, item]) => {
                const options = formatOptions(item.options);
                return (
                  <div
                    key={key}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.quantity > 1 && (
                        <span className="font-mono font-semibold">
                          {item.quantity}×{" "}
                        </span>
                      )}
                      {item.name}
                      {options && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {options}
                        </span>
                      )}
                    </span>
                    {item.price_cents !== null &&
                      item.price_cents !== undefined && (
                        <span className="shrink-0 font-mono text-muted-foreground">
                          {formatPrice(item.price_cents * item.quantity)}
                        </span>
                      )}
                  </div>
                );
              })}
            </div>
            {cartPriced && (
              <>
                <div className="perforation shrink-0" />
                <div className="flex shrink-0 items-baseline justify-between px-4 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {formatPrice(total)}
                  </span>
                </div>
                {paysInPerson && total > 0 && (
                  <p className="shrink-0 px-4 pb-2.5 text-sm text-muted-foreground">
                    Pay at the counter when you collect.
                  </p>
                )}
              </>
            )}
          </>
        )}
        <div className="perforation shrink-0" />

        <form
          onSubmit={onSubmit}
          className="flex shrink-0 flex-col gap-5 px-4 pt-4"
        >
          <section className="space-y-2.5">
            <Label
              htmlFor="customerName"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Your name
            </Label>
            <Input
              id="customerName"
              placeholder="So we can call you when it's ready"
              className="h-12 rounded-xl text-base"
              aria-invalid={!!errors.customerName}
              aria-describedby={
                errors.customerName ? "customerName-error" : undefined
              }
              {...register("customerName")}
            />
            {errors.customerName && (
              <p
                id="customerName-error"
                className="text-sm font-medium text-destructive"
              >
                {errors.customerName.message}
              </p>
            )}
          </section>

          <section className="space-y-2.5">
            <Label
              htmlFor="customerPhone"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Phone number (optional)
            </Label>
            <Input
              id="customerPhone"
              type="tel"
              placeholder="So we can recognize you next time"
              className="h-12 rounded-xl text-base"
              aria-invalid={!!errors.customerPhone}
              aria-describedby={
                errors.customerPhone ? "customerPhone-error" : undefined
              }
              {...register("customerPhone")}
            />
            {errors.customerPhone && (
              <p
                id="customerPhone-error"
                className="text-sm font-medium text-destructive"
              >
                {errors.customerPhone.message}
              </p>
            )}
          </section>

          <DataCollectionNotice
            purpose="identify your order and send you order updates"
            phoneOptional
          />

          <SheetFooter className="gap-2 px-0 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {submitError && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive"
              >
                {submitError}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="h-14 w-full rounded-xl text-base font-semibold"
              disabled={submitting || !hasItems || closed}
            >
              {confirmLabel}
            </Button>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full font-normal text-muted-foreground"
                disabled={submitting}
              >
                Back to menu
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
