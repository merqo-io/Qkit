"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { placeOrder } from "@/app/o/[code]/actions";
import type { PlaceOrderInput } from "@/lib/schemas";
import { clearCart } from "@/lib/cart-storage";
import {
  loadPendingOrder,
  savePendingOrder,
  clearPendingOrder,
  orderFingerprint,
  type PendingOrder,
  RecoveryStorageError,
} from "@/lib/pending-order";
import { addRecentOrder } from "@/lib/recent-orders";
import type { CheckoutFormValues } from "./checkout-sheet";
import type { useCartAvailability } from "./use-cart-availability";

interface Args {
  code: string;
  boothId: string;
  closed: boolean;
  cartItems: PlaceOrderInput["items"];
  holdSession: ReturnType<typeof useCartAvailability>["holdSession"];
}

function usePendingOrderNotice(boothId: string) {
  useEffect(() => {
    try {
      if (loadPendingOrder(boothId))
        toast.error(
          "A previous order is awaiting confirmation. Re-enter the same details to recover it.",
        );
    } catch (error) {
      if (error instanceof RecoveryStorageError) {
        toast.error(
          "Order recovery storage is unavailable. Stay on this page if you place an order.",
        );
        return;
      }
      toast.error(
        "Could not restore the previous order attempt. Check with the vendor before ordering again.",
      );
    }
  }, [boothId]);
}

async function prepareOrderAttempt(
  boothId: string,
  unresolvedSubmit: PendingOrder | null,
  setUnresolvedSubmit: (attempt: PendingOrder | null) => void,
  input: PlaceOrderInput,
): Promise<string | null> {
  try {
    const fingerprint = await orderFingerprint(input);
    let pending = unresolvedSubmit;
    let canPersist = true;
    try {
      pending ??= loadPendingOrder(boothId);
    } catch (error) {
      if (!(error instanceof RecoveryStorageError)) throw error;
      canPersist = false;
    }
    if (pending && pending.fingerprint !== fingerprint) {
      toast.error("Retry your previous order before changing its details.");
      return null;
    }
    const attempt = pending ?? { key: crypto.randomUUID(), fingerprint };
    setUnresolvedSubmit(attempt);
    try {
      savePendingOrder(boothId, attempt);
    } catch (error) {
      if (!(error instanceof RecoveryStorageError)) throw error;
      canPersist = false;
    }
    if (!canPersist)
      toast.error(
        "This order can only be recovered on this page. Keep it open until confirmation.",
      );
    return attempt.key;
  } catch {
    toast.error(
      "Could not safely restore this order. Check with the vendor before ordering again.",
    );
    return null;
  }
}

export function useOrderSubmission({
  code,
  boothId,
  closed,
  cartItems,
  holdSession,
}: Args) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  // Why the last attempt to place the order failed. Shown in the checkout
  // sheet beside the button, so it stays put until the customer acts on it.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // A ref, not state: the attempt's key must be readable by the very next tap
  // and must survive sessionStorage being unavailable, so a retry reuses it.
  const unresolvedSubmit = useRef<PendingOrder | null>(null);
  const setUnresolvedSubmit = (attempt: PendingOrder | null) => {
    unresolvedSubmit.current = attempt;
  };
  // Synchronous guard: `submitting` only disables the button after a re-render,
  // so two taps in the same frame would both get through without this.
  const inFlight = useRef(false);

  usePendingOrderNotice(boothId);

  async function onSubmit(formData: CheckoutFormValues) {
    if (inFlight.current) return;
    if (closed) {
      toast.error("This booth is closed right now");
      return;
    }
    if (cartItems.length === 0) {
      toast.error("Add at least one item to your order");
      return;
    }
    inFlight.current = true;
    let placed = false;
    try {
      placed = await submitOrder(formData);
    } finally {
      // Held after success so a tap during navigation can't place a second order.
      if (!placed) inFlight.current = false;
    }
  }

  async function submitOrder(formData: CheckoutFormValues): Promise<boolean> {
    setSubmitting(true);
    setSubmitError(null);

    const input: PlaceOrderInput = {
      customerName: formData.customerName,
      customerPhone: formData.customerPhone,
      items: cartItems,
    };
    const idem = await prepareOrderAttempt(
      boothId,
      unresolvedSubmit.current,
      setUnresolvedSubmit,
      input,
    );
    if (idem === null) {
      setSubmitting(false);
      return false;
    }
    // One retry on a transient network failure (patchy event-site signal) so a
    // dropped request doesn't lose the order. The DB order number is atomic, so
    // a retried submit can't duplicate.
    // The basket's hold, when the booth has stock to hold, goes with the
    // order so placing it lets the hold go.
    const session = holdSession();
    const submit = () =>
      session
        ? placeOrder(code, input, idem, session)
        : placeOrder(code, input, idem);
    let result: Awaited<ReturnType<typeof placeOrder>>;
    try {
      result = await submit();
    } catch {
      try {
        result = await submit();
      } catch {
        setSubmitError(
          "We couldn't confirm whether your order went through. Keep this page open and retry with the same details to recover it.",
        );
        setSubmitting(false);
        return false;
      }
    }

    try {
      clearPendingOrder(boothId);
      setUnresolvedSubmit(null);
    } catch {
      toast.error(
        "Could not clear the saved order attempt. Check this order before ordering again.",
      );
    }

    if (!result.success) {
      setSubmitError(
        result.error ?? "The order did not go through. Try again.",
      );
      setSubmitting(false);
      return false;
    }

    // Order placed — the persisted cart has served its purpose; drop it so
    // returning to this booth starts fresh rather than restoring a placed cart.
    clearCart(boothId);

    // Remember on-device so the customer can find this order again after
    // closing the tab (no server-side customer identity exists). The compact
    // items snapshot powers one-tap reorder from the list. A payment-required
    // order has no number yet; the list reaches it through its token's pay
    // step until the status page fills the number in.
    addRecentOrder({
      boothId,
      ...(result.orderNumber ? { orderNumber: result.orderNumber } : {}),
      customerName: formData.customerName,
      // The per-order token gates the status page + its polling reads; store it
      // so a "track your recent order" link can reopen the page later.
      token: result.accessToken,
      items: cartItems.map((it) => ({
        menuItemId: it.menuItemId,
        quantity: it.quantity,
        options: it.options,
      })),
    });

    // Payment-required orders return no order_number yet (Task 1) — they route
    // to payment before getting a number. Non-payment orders flow to the
    // customer's live status page.
    if (result.orderNumber) {
      router.push(
        `/order/${result.boothId}/${result.orderNumber}?t=${result.accessToken}`,
      );
    } else {
      router.push(`/order/${result.boothId}/pay?t=${result.accessToken}`);
    }
    return true;
  }

  return { submitting, submitError, onSubmit };
}
