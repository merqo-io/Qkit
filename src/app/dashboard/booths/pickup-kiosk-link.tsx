"use client";

import { useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@merqo/ui";

const subscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

/** The public pickup kiosk URL for one booth. */
export function pickupKioskUrl(origin: string, boothId: string): string {
  return `${origin}/order/${boothId}/pickup`;
}

/**
 * Where a vendor finds the self-checkout kiosk once the switch is on. The
 * origin comes from the browser so the link matches the host being used, and
 * is empty during server render to keep hydration stable.
 */
export function PickupKioskLink({ boothId }: { boothId: string }) {
  const origin = useSyncExternalStore(subscribe, getOrigin, getServerOrigin);
  const path = `/order/${boothId}/pickup`;
  const url = pickupKioskUrl(origin, boothId);

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <p className="text-sm text-muted-foreground">
        Open this page on the tablet at your pickup shelf and pair a Bluetooth
        barcode scanner to it. Customers hold their ready order&apos;s QR up to
        the scanner.
      </p>
      <p className="break-all text-sm font-medium">{url}</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold [@media(pointer:coarse)]:h-11"
        >
          <ExternalLink className="size-4" />
          Open kiosk
        </a>
        <CopyButton
          value={url}
          size="default"
          className="h-9 rounded-xl [@media(pointer:coarse)]:h-11"
          label="Copy link"
          onError={() => toast.error("Could not copy. Open the kiosk instead.")}
        />
      </div>
    </div>
  );
}
