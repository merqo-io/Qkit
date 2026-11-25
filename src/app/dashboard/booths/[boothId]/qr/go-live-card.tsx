import type { ReactNode } from "react";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { Button } from "@merqo/ui/primitives";

import { orderPath } from "@/lib/booth/code";
import { EYEBROW_CLASS } from "@/lib/utils";

/**
 * `unknown` means paykit did not answer, so the step shows no tick either way.
 * `checking` is the placeholder shown while paykit is still being asked.
 */
export type PaymentStep = "ready" | "missing" | "unknown" | "checking";

interface Props {
  boothId: string;
  code: string;
  menuReady: boolean;
  paymentRow: ReactNode;
}

const LINK_CLASS =
  "inline-flex min-h-11 items-center font-medium text-primary hover:underline";

function Tick({ done }: { done: boolean }) {
  return done ? (
    <Check className="size-5 shrink-0 text-primary" aria-label="Done" />
  ) : (
    <Circle
      className="size-5 shrink-0 text-muted-foreground"
      aria-label="Not done"
    />
  );
}

const PAYMENT_LINK_TEXT: Record<Exclude<PaymentStep, "checking">, string> = {
  ready: "Change payment",
  missing: "Set up payment",
  unknown: "Check payment in paykit",
};

/**
 * The link opens in this tab: paykit's way back lands on the tab that sent
 * the vendor, and a second tab on a phone strands them in paykit.
 */
export function PaymentRow({
  payment,
  paymentUrl,
}: {
  payment: PaymentStep;
  paymentUrl: string;
}) {
  return (
    <li className="flex items-center gap-3 py-1">
      {payment === "checking" ? (
        <Circle
          className="size-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      ) : (
        payment !== "unknown" && <Tick done={payment === "ready"} />
      )}
      <span className="flex-1">Payment set up</span>
      {payment === "checking" ? (
        <span className="inline-flex min-h-11 items-center text-muted-foreground">
          Checking payment...
        </span>
      ) : (
        <a href={paymentUrl} className={LINK_CLASS}>
          {PAYMENT_LINK_TEXT[payment]}
        </a>
      )}
    </li>
  );
}

export function GoLiveCard({ boothId, code, menuReady, paymentRow }: Props) {
  return (
    <section
      aria-label="Go live"
      className="space-y-1 rounded-2xl border border-border bg-card px-5 py-4"
    >
      <p className={EYEBROW_CLASS}>Go live</p>
      <ul className="divide-y divide-border">
        <li className="flex items-center gap-3 py-1">
          <Tick done={menuReady} />
          <span className="flex-1">Menu ready</span>
          <Link
            href={`/dashboard/booths/${boothId}/menu`}
            className={LINK_CLASS}
          >
            {menuReady ? "Edit menu" : "Add items"}
          </Link>
        </li>
        {paymentRow}
        <li className="space-y-2 py-3">
          <div className="flex items-center gap-3">
            <Circle
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="flex-1">Place a test order</span>
          </div>
          <Button asChild size="lg" className="h-12 w-full rounded-xl">
            <a href={orderPath(code)} target="_blank" rel="noopener noreferrer">
              Open my booth page
            </a>
          </Button>
          <p className="text-sm text-muted-foreground">
            Order from your phone, then watch it land on your board.{" "}
            <Link href="/dashboard" className={LINK_CLASS}>
              Go to board
            </Link>
          </p>
        </li>
      </ul>
    </section>
  );
}
