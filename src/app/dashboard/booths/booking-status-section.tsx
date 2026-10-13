"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";
import type { BookingStatus } from "@/lib/paykit/client";

const STATUS_LABEL: Record<BookingStatus["status"], string> = {
  pending_deposit: "Awaiting deposit",
  deposit_paid: "Deposit paid",
  fully_paid: "Fully paid",
  cancelled: "Cancelled",
};

// General entry point for finding/creating a booking before pasting its ID
// here.
function paykitBookingsLink(): string | null {
  const paykitUrl = process.env.NEXT_PUBLIC_PAYKIT_URL;
  if (!paykitUrl) return null;
  return new URL("/dashboard/bookings", paykitUrl).toString();
}

function PaidMark({ paid }: { paid: boolean }) {
  return (
    <span className={paid ? "text-status-ready" : "text-muted-foreground"}>
      {paid ? "Paid" : "Not yet paid"}
    </span>
  );
}

export function BookingStatusSection({
  value,
  onChange,
  status,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  // Fetched server-side (see [boothId]/page.tsx via getBookingStatus). Null
  // whenever there's nothing to show — no booking id set yet, or paykit's
  // read failed/degraded (unreachable, PAYKIT_KIT_SECRET unset) — either
  // way this never blocks the rest of the dashboard.
  status?: BookingStatus | null;
}) {
  const bookingsLink = paykitBookingsLink();

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        <Label
          htmlFor="paykit-booking-id"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Paykit booking ID
        </Label>
        <Input
          id="paykit-booking-id"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value.trim() || null)}
          placeholder="Paste the booking ID from paykit's dashboard"
          className="h-12 rounded-xl text-base"
        />
        <p className="text-sm text-muted-foreground">
          Optional. Links this booth to a deposit/balance booking you&apos;ve
          already created in paykit, so its live payment status shows here.
          {bookingsLink && (
            <>
              {" "}
              <a
                href={bookingsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                Find or create a booking in paykit →
              </a>
            </>
          )}
        </p>
      </div>

      {value && status === null && (
        <p className="px-1 text-sm text-muted-foreground">
          Booking status unavailable right now.
        </p>
      )}

      {value && status && (
        <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{STATUS_LABEL[status.status]}</span>
            <span className="text-muted-foreground">
              Event {new Date(status.eventDate).toLocaleDateString("en-SG")}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span>Deposit {formatPrice(status.depositAmountCents)}</span>
            <PaidMark paid={status.depositConfirmed} />
          </div>
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span>Balance {formatPrice(status.balanceAmountCents)}</span>
            <PaidMark paid={status.balanceConfirmed} />
          </div>
        </div>
      )}
    </div>
  );
}
