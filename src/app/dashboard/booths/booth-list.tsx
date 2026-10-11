"use client";

import Link from "next/link";
import { MediaImage } from "@/components/widgets/media-image";
import { toast } from "sonner";
import { Copy, Pencil, QrCode, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Ticket } from "@/components/widgets/ticket";

interface BoothRow {
  id: string;
  name: string;
  is_active: boolean;
  image_url: string | null;
  itemCount: number;
  // Active but beyond the plan's serve limit — not orderable by customers.
  paused: boolean;
  // Current rotating short code → the canonical /o/{code} order URL.
  shortCode: string;
}

/**
 * Status pill text + color for a booth. "Paused" is the vendor's own switch,
 * the word the board uses for it; a booth the plan will not serve is named
 * for that instead, so the two cannot be mistaken for each other.
 */
function boothStatus(booth: Pick<BoothRow, "paused" | "is_active">) {
  if (booth.paused)
    return { label: "Over plan limit", className: "text-status-aging" };
  if (booth.is_active) return { label: "Open", className: "text-status-ready" };
  return { label: "Paused", className: "text-muted-foreground" };
}

export function BoothList({ booths }: { booths: BoothRow[] }) {
  async function copyLink(shortCode: string) {
    const url = `${window.location.origin}/o/${shortCode}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Order link copied");
    } catch {
      toast.error("Could not copy the link. Open the booth QR to share it.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {booths.map((booth) => {
        const status = boothStatus(booth);
        return (
          <Ticket
            key={booth.id}
            shadow="none"
            radius="xl"
            clip
            className="flex flex-col"
          >
            <div className="relative h-28 w-full bg-muted">
              {booth.image_url && (
                <MediaImage
                  src={booth.image_url}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 20rem"
                  className="object-cover"
                />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-lg font-semibold leading-tight">
                  {booth.name}
                </p>
                <span
                  className={`mt-1 inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold ${status.className}`}
                  title={
                    booth.paused
                      ? "Open, but not taking orders: your plan serves one live booth at a time"
                      : undefined
                  }
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  {status.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {booth.itemCount} item{booth.itemCount === 1 ? "" : "s"}
              </p>
              <div className="mt-auto flex gap-2">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-lg"
                >
                  <Link href={`/dashboard/booths/${booth.id}`}>
                    <Pencil className="size-3.5" /> Edit
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  aria-label="Booth QR code"
                >
                  <Link href={`/dashboard/booths/${booth.id}/qr`}>
                    <QrCode className="size-3.5" />
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => copyLink(booth.shortCode)}
                  aria-label="Copy order link"
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  aria-label="Open the customer queue display"
                  title="Open the customer queue display. It is a normal web page, so a spare phone or tablet works as the second screen when a monitor will not extend."
                >
                  <Link
                    href={`/order/${booth.id}/display`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Tv className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </Ticket>
        );
      })}
    </div>
  );
}
