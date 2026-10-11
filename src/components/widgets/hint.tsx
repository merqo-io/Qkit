"use client";

import { InfoTooltip } from "@merqo/ui";

/**
 * The small (i) that says what a control is for. It opens on tap, so it works
 * on a phone, where a hover tooltip never shows and tap-and-hold starts a text
 * selection instead.
 *
 * Use this, not a hover Tooltip, for anything a vendor has to understand; a
 * hover Tooltip is only for naming an icon-only button on a desktop.
 *
 * The icon stays 16px so it reads as a quiet aside. On a touch device
 * InfoTooltip gives it a 44px touch area that extends 14px past each edge; the
 * `ml-3.5` here is that same 14px, so the area stops at the edge of the
 * control it explains instead of covering part of it.
 */
export function Hint({ label, children }: { label: string; children: string }) {
  return (
    <span className="ml-3.5 inline-flex">
      <InfoTooltip content={children} ariaLabel={label} trigger="tap" />
    </span>
  );
}
