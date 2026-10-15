"use client";

import { useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/switch";
import type { PaymentSetup } from "@/lib/paykit/payment-setup";

// Mirrors src/lib/paykit/client.ts's fallback — duplicated since this is a
// client component reading NEXT_PUBLIC_* directly.
const PAYKIT_FALLBACK_URL = "https://paykit.merqo.io";

function neverChanges() {
  return () => {};
}

function currentPage(): string {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}`;
}

/**
 * paykit's payment setup page, carrying this page as the way back. Only the
 * browser knows the address this page is really served on, so the way back
 * is added once the component is running in one; the server render links to
 * the setup page alone. paykit decides whether to honour the address.
 */
function useSetupUrl(): string {
  const returnTo = useSyncExternalStore(neverChanges, currentPage, () => null);
  const base = process.env.NEXT_PUBLIC_PAYKIT_URL ?? PAYKIT_FALLBACK_URL;
  const url = new URL("/dashboard/config", base);
  if (returnTo) url.searchParams.set("return_to", returnTo);
  return url.href;
}

function summaryOf(setup: PaymentSetup): string {
  if (setup.state === "none") return "No payment details on file yet.";
  if (setup.state === "unreachable")
    return "Can't reach paykit right now. This booth keeps its current payment setting.";

  if (setup.state === "paynow")
    return setup.name
      ? `On file in paykit: PayNow QR, paid to ${setup.name}`
      : "On file in paykit: PayNow QR";

  const kind = setup.state === "link" ? "payment link" : "your own QR image";
  return setup.name
    ? `On file in paykit: ${kind}, “${setup.name}”`
    : `On file in paykit: ${kind}`;
}

function linkTextOf(setup: PaymentSetup): string {
  if (setup.state === "none") return "Set up payments in paykit →";
  if (setup.state === "unreachable") return "Open payment setup in paykit →";
  return "Change payment details in paykit →";
}

/**
 * Whether this booth takes payment, and what the vendor has on file to take
 * it with. The details are entered in paykit, once for every booth and every
 * Merqo app; here they are only named. The switch is this booth's own.
 */
export function PaymentSection({
  setup,
  value,
  onChange,
}: {
  // What paykit holds for this vendor, read when the page was rendered.
  setup: PaymentSetup;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const setupUrl = useSetupUrl();
  // With nothing on file there is nothing to take payment with. When paykit
  // did not answer, a save keeps the stored setting whatever this says, so
  // the switch shows that setting and is locked.
  const nothingOnFile = setup.state === "none";
  const locked = nothingOnFile || setup.state === "unreachable";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-sm">
          <span className="font-medium">
            Take payment for orders at this booth
          </span>
          <span className="block text-muted-foreground">
            While off, customers just join the queue and settle up at the
            counter.
          </span>
        </span>
        <Switch
          checked={value && !nothingOnFile}
          onCheckedChange={onChange}
          disabled={locked}
          aria-label="Take payment for orders at this booth"
        />
      </div>

      <p className="px-1 text-sm text-muted-foreground">{summaryOf(setup)}</p>

      <p className="px-1 text-sm">
        <a href={setupUrl} className="font-medium text-primary hover:underline">
          {linkTextOf(setup)}
        </a>
      </p>
    </div>
  );
}
