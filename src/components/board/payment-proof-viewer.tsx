"use client";

import { useEffect, useState } from "react";
import {
  getOrderPaymentProof,
  type OrderPaymentProof,
} from "@/app/dashboard/payment-evidence-actions";

interface Props {
  orderId: string;
  expectedAmountCents: number;
}

type ProofView = OrderPaymentProof & { orderId: string };

const NOTHING: OrderPaymentProof = {
  url: null,
  duplicateOrderNumber: null,
  duplicateOrderDay: null,
  duplicateElsewhere: false,
  amountMatch: null,
};

/**
 * The payment screenshot for one order, with what paykit says about it: a
 * duplicate warning, and whether the order's amount was read in the photo.
 * Both are hints for the vendor. Nothing here reads the photo itself; paykit
 * does that on its server, and reports no amount hint when it could not.
 */
export function PaymentProofViewer({ orderId, expectedAmountCents }: Props) {
  const [proof, setProof] = useState<ProofView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await getOrderPaymentProof(orderId);
        if (!cancelled) setProof({ ...(found ?? NOTHING), orderId });
      } catch (error) {
        if (!cancelled) console.error("Payment proof failed to load", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!proof || proof.orderId !== orderId) return null;
  const {
    url,
    duplicateOrderNumber,
    duplicateOrderDay,
    duplicateElsewhere,
    amountMatch,
  } = proof;

  if (!url)
    return (
      <p className="text-sm text-muted-foreground">
        No payment screenshot on file. Check your payment app before confirming.
      </p>
    );

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Payment proof" className="w-full rounded-lg" />
      {duplicateOrderNumber && (
        <p className="text-sm font-semibold text-destructive">
          This photo was already used for order #{duplicateOrderNumber}
          {duplicateOrderDay && ` on ${duplicateOrderDay}`}
        </p>
      )}
      {!duplicateOrderNumber && duplicateElsewhere && (
        <p className="text-sm font-semibold text-destructive">
          This photo was already used for another payment
        </p>
      )}
      {amountMatch !== null && (
        <p className="text-sm text-muted-foreground">
          {amountMatch
            ? `Amount matches $${(expectedAmountCents / 100).toFixed(2)}. Verify payment in your payment app.`
            : "Couldn't confirm the amount, check manually"}
        </p>
      )}
    </div>
  );
}
