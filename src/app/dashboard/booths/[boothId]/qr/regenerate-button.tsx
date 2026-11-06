"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@merqo/ui";
import { Button } from "@/components/ui/button";
import { regenerateShortCode } from "../../actions";

/**
 * Vendor-only "Regenerate QR" control. Rotating the token invalidates every
 * printed/saved QR for this booth, so the action is gated behind a confirmation
 * that names the booth explicitly (guards against acting on the wrong one).
 */
export function RegenerateButton({
  boothId,
  boothName,
}: {
  boothId: string;
  boothName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function confirm() {
    // A rejected call becomes an empty message so the dialog shows its own
    // friendly errorMessage instead of a raw network error.
    const res = await regenerateShortCode(boothId).catch(() => null);
    if (!res?.success) throw new Error(res?.error ?? "");
    toast.success("New QR generated, reprint to use it.");
    router.refresh();
  }

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className="h-12 w-full rounded-xl text-base font-semibold"
        onClick={() => setOpen(true)}
      >
        <RefreshCw className="size-4" /> Regenerate QR
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Regenerate QR for \u201C${boothName}\u201D?`}
        description="Every printed or saved code for this booth stops working immediately. You'll need to reprint the QR."
        confirmLabel="Regenerate QR"
        pendingLabel="Regenerating…"
        errorMessage="Could not regenerate QR. Try again."
        onConfirm={confirm}
      />
    </>
  );
}
