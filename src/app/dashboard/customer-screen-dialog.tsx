"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { Copy, ExternalLink, Tv } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Booth = { id: string; name: string };

/** The public big-number queue screen for one booth. */
export function customerScreenUrl(origin: string, boothId: string): string {
  return `${origin}/order/${boothId}/display`;
}

// A separate window, not a tab: a tab cannot be dragged to another screen
// without tearing it off first, and that step is what vendors got stuck on.
// Sized to open as a window on any laptop; it is made full screen on the TV.
const WINDOW_FEATURES = "popup,width=1280,height=720";

function ScreenOptions({ booth }: { booth: Booth }) {
  // Rendered only once the dialog is open, so always in the browser.
  const url = customerScreenUrl(window.location.origin, booth.id);

  function openWindow() {
    const opened = window.open(url, `qkit-screen-${booth.id}`, WINDOW_FEATURES);
    if (!opened)
      toast.error(
        "Your browser blocked the window. Allow pop-ups for this site, or use the link below.",
      );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Scan the code instead.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          A TV or monitor plugged into this computer
        </h3>
        <p className="text-sm text-muted-foreground">
          A new window opens. Drag it onto the TV, then make it full screen.
        </p>
        <Button
          type="button"
          className="h-11 w-full rounded-xl font-semibold"
          onClick={openWindow}
        >
          <ExternalLink className="size-4" />
          Open the screen
        </Button>
      </section>

      <div className="perforation" />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">An iPad or another device</h3>
        <p className="text-sm text-muted-foreground">
          Scan this with its camera. It needs no login, and works in any
          browser.
        </p>
        {/* pb-2 on top of the section's space-y-3 puts 20px between the code
            and its button, the same gap as between the dialog's sections. */}
        <div className="flex justify-center pb-2">
          <div className="rounded-xl border border-border bg-white p-3">
            <QRCode
              value={url}
              size={176}
              style={{ height: "auto", maxWidth: "100%", width: "176px" }}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-xl"
          onClick={copyLink}
        >
          <Copy className="size-4" />
          Copy the link
        </Button>
      </section>
    </div>
  );
}

/**
 * The board's way to the customer-facing queue screen (/order/{id}/display).
 * It is a plain public web page, so the two ways offered cover every setup a
 * stall has brought: a window to drag onto a TV or an iPad used as an extended
 * display, in whatever browser the laptop runs, and a code to scan for a
 * device that is not attached to the computer at all.
 */
export function CustomerScreenButton({
  booths,
  defaultBoothId,
}: {
  booths: Booth[];
  defaultBoothId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  if (booths.length === 0) return null;

  const booth =
    booths.find((b) => b.id === (chosenId ?? defaultBoothId)) ?? booths[0];

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="rounded-full [@media(pointer:coarse)]:min-w-11"
        onClick={() => setOpen(true)}
        aria-label="Customer screen"
      >
        <Tv className="size-3.5" />
        <span className="hidden sm:inline">Customer screen</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Customer screen</DialogTitle>
            <DialogDescription>
              A big-number screen for the queue. It shows which orders are being
              made and which are ready to collect.
            </DialogDescription>
          </DialogHeader>
          {booths.length > 1 && (
            <div
              role="radiogroup"
              aria-label="Booth"
              className="flex flex-wrap gap-2"
            >
              {booths.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={b.id === booth.id}
                  onClick={() => setChosenId(b.id)}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                    b.id === booth.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
          {open && <ScreenOptions booth={booth} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
