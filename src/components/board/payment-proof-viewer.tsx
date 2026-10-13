"use client";

import { useEffect, useState } from "react";
import { getOrderPaymentProof } from "@/app/dashboard/payment-evidence-actions";

interface Props {
  orderId: string;
  expectedAmountCents: number;
}

type ProofView = {
  orderId: string;
  expectedAmountCents: number;
  url: string | null;
  duplicateOrderNumber: string | null;
  duplicateElsewhere: boolean;
  // null until something has checked the amount: paykit, or the OCR below.
  amountMatch: boolean | null;
};

// Self-hosted under /public/tesseract (see that folder's own note) — never
// the default jsDelivr CDN, so the model's WASM/worker/traineddata assets
// stay same-origin under this app's CSP. corePath is a directory (not a
// single file): tesseract.js picks between its SIMD/non-SIMD LSTM builds at
// runtime, both of which live there.
const TESSERACT_ASSET_PATH = "/tesseract";

export function PaymentProofViewer({ orderId, expectedAmountCents }: Props) {
  const [proof, setProof] = useState<ProofView | null>(null);

  useEffect(() => {
    let cancelled = false;
    let worker: Awaited<
      ReturnType<typeof import("tesseract.js").createWorker>
    > | null = null;
    const terminate = async () => {
      const activeWorker = worker;
      worker = null;
      await activeWorker?.terminate();
    };
    void (async () => {
      try {
        const found = await getOrderPaymentProof(orderId);
        if (cancelled) return;
        const view: ProofView = {
          orderId,
          expectedAmountCents,
          url: found?.url ?? null,
          duplicateOrderNumber: found?.duplicateOrderNumber ?? null,
          duplicateElsewhere: found?.duplicateElsewhere ?? false,
          amountMatch: found?.amountMatch ?? null,
        };
        setProof(view);
        // paykit's own reading of the amount, when it has one, stands: the
        // photo is not read a second time here.
        if (!view.url || view.amountMatch !== null) return;

        // OCR failure leaves the photo available for manual review.
        const { createWorker } = await import("tesseract.js");
        if (cancelled) return;
        worker = await createWorker("eng", 1, {
          workerPath: `${TESSERACT_ASSET_PATH}/worker.min.js`,
          corePath: TESSERACT_ASSET_PATH,
          langPath: TESSERACT_ASSET_PATH,
          // Keep worker loading same-origin under the script CSP.
          workerBlobURL: false,
        });
        if (cancelled) return;
        const { data } = await worker.recognize(view.url);
        if (cancelled) return;
        // OCR is an amount hint, never proof that a transfer settled.
        // No lookbehind: Safari before 16.4 fails to parse the whole chunk.
        const amounts = Array.from(
          data.text.matchAll(
            /(?:^|[^\d.,])((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})(?![\d.,])/g,
          ),
          (match) => match[1],
        );
        const expected = (expectedAmountCents / 100).toFixed(2);
        const amountMatch = amounts.some(
          (amount) => amount.replaceAll(",", "") === expected,
        );
        setProof({ ...view, amountMatch });
      } catch (error) {
        if (!cancelled) console.error("Payment proof OCR failed", error);
      } finally {
        await terminate().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
      terminate().catch(() => {});
    };
  }, [orderId, expectedAmountCents]);

  if (
    !proof ||
    proof.orderId !== orderId ||
    proof.expectedAmountCents !== expectedAmountCents
  )
    return null;
  const { url, duplicateOrderNumber, duplicateElsewhere, amountMatch } = proof;

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
