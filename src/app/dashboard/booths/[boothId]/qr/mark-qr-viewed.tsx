"use client";

import { useEffect } from "react";
import { writeSetupFlag } from "@/lib/setup-checklist-storage";

/** Records that the vendor has seen this booth's QR page, for the setup checklist. */
export function MarkQrViewed({ boothId }: { boothId: string }) {
  useEffect(() => {
    writeSetupFlag("qr-viewed", boothId);
  }, [boothId]);
  return null;
}
