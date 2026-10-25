"use client";

import { useState, type ReactNode } from "react";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { formatPrice, EYEBROW_CLASS } from "@/lib/utils";
import type { CheckoutView } from "@/lib/paykit/client";

interface Props {
  amountCents: number;
  // The booth's own payment view from paykit, or null when it could not be
  // loaded. The step still works without it: staff take the money another
  // way and confirm the same.
  checkout: CheckoutView | null;
  confirming: boolean;
  onPaid: () => void;
  onLater: () => void;
}

const QR_SIZE = 208;

function QrFrame({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-white p-3">{children}</div>;
}

/**
 * The code the customer scans, and one line saying what it does. A payment
 * link is shown as a QR of that link: on the customer's own page it is a
 * button, but here the screen is the vendor's, so the customer needs a way to
 * open it on their own phone.
 */
function PaymentCode({ checkout }: { checkout: CheckoutView | null }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!checkout || (checkout.type === "image" && imageFailed)) {
    return (
      <p className="max-w-xs text-center text-sm text-muted-foreground">
        The payment QR could not load. Take payment another way, then tap
        Payment received.
      </p>
    );
  }

  if (checkout.type === "qr") {
    return (
      <>
        <QrFrame>
          <QRCode value={checkout.payload} size={QR_SIZE} />
        </QrFrame>
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          Scan with any PayNow banking app. The amount is already filled in.
        </p>
      </>
    );
  }

  if (checkout.type === "link") {
    return (
      <>
        <QrFrame>
          <QRCode value={checkout.url} size={QR_SIZE} />
        </QrFrame>
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          Scan with a phone camera to open the payment page.
        </p>
      </>
    );
  }

  return (
    <>
      <QrFrame>
        {/* eslint-disable-next-line @next/next/no-img-element -- the QR is a data URL, nothing for next/image to optimise */}
        <img
          src={checkout.url}
          alt="Payment QR"
          onError={() => setImageFailed(true)}
          className="size-52 object-contain"
        />
      </QrFrame>
      <p className="max-w-xs text-center text-sm text-muted-foreground">
        Scan with a banking or payment app, then enter the amount above.
      </p>
    </>
  );
}

/**
 * Second step of a walk-up order at a booth that takes payment: the order is
 * already on the board, unpaid, and this is the screen staff turn towards the
 * customer. Amount first and large, because it is read from across a counter.
 *
 * Nothing here can tell that money arrived. PayNow and the pointer methods
 * report nothing back, and a walk-up customer has no order page to claim
 * from, so the step ends on a tap: "Payment received" once staff have seen
 * it, or "Collect later", which leaves the ticket unpaid with its own "Mark
 * as paid".
 */
export function WalkupPayStep({
  amountCents,
  checkout,
  confirming,
  onPaid,
  onLater,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Only this part scrolls, so the two buttons stay in reach on a short
          screen. min-h-full on the inner box centres the QR when there is
          room and lets it start from the top when there is not. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col items-center justify-center gap-3 p-5">
          <p className={EYEBROW_CLASS}>Amount to pay</p>
          <p className="font-mono text-5xl font-bold">
            {formatPrice(amountCents)}
          </p>
          <PaymentCode checkout={checkout} />
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-t border-border p-4">
        <p className="hidden text-center text-xs text-muted-foreground sm:block">
          Paid in cash or by card? Tap Payment received once you have it.
        </p>
        <div className="flex flex-row-reverse gap-2">
          <Button
            type="button"
            size="lg"
            className="h-12 flex-[1.4] rounded-xl font-semibold"
            disabled={confirming}
            onClick={onPaid}
          >
            {confirming ? "Confirming…" : "Payment received"}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-12 flex-1 rounded-xl"
            disabled={confirming}
            onClick={onLater}
          >
            Collect later
          </Button>
        </div>
      </div>
    </div>
  );
}
