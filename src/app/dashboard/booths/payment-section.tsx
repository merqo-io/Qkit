"use client";

import { useSyncExternalStore } from "react";
import { Switch } from "@merqo/ui/primitives";

import { SettingRow } from "./setting-row";
import type { PaymentSetup } from "@/lib/paykit/payment-setup";
import { paykitSetupUrl } from "@/lib/paykit/setup-url";

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
  return paykitSetupUrl(returnTo);
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
  isNewBooth = false,
}: {
  // What paykit holds for this vendor, read when the page was rendered.
  setup: PaymentSetup;
  value: boolean;
  onChange: (next: boolean) => void;
  isNewBooth?: boolean;
}) {
  const setupUrl = useSetupUrl();
  // With nothing on file there is nothing to take payment with. When paykit
  // did not answer, a save keeps the stored setting whatever this says, so
  // the switch shows that setting and is locked.
  const nothingOnFile = setup.state === "none";
  const locked = nothingOnFile || setup.state === "unreachable";

  return (
    <div className="space-y-3">
      <SettingRow
        label="Take payment"
        hint="Customers pay when they order. While off, they just join the queue and settle up at the counter."
        hintLabel="About taking payment"
      >
        <Switch
          checked={value && !nothingOnFile}
          onCheckedChange={onChange}
          disabled={locked}
          aria-label="Take payment for orders at this booth"
        />
      </SettingRow>

      <p className="px-1 text-sm text-muted-foreground">{summaryOf(setup)}</p>

      {isNewBooth ? (
        <p className="px-1 text-sm text-muted-foreground">
          Save this booth first. Then set up or change payment from the Go live
          card on its QR page.
        </p>
      ) : (
        <p className="px-1 text-sm">
          <a
            href={setupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            {linkTextOf(setup)}
          </a>
        </p>
      )}
    </div>
  );
}
