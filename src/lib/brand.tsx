/* eslint-disable no-restricted-syntax -- ImageResponse needs literal CSS colours */
import type { ReactElement } from "react";
import { brandIcon } from "@merqo/ui";

// Hex approximations of the `--primary` khaki on chalk-cream paper.
export const BRAND_KHAKI = "#bc892b";
export const BRAND_OAT = "#efe3c8";

/**
 * The qkit "Q" app mark for ImageResponse-generated icons (favicon, manifest,
 * apple-touch). A system serif stands in for Fraunces: fine at icon scale and
 * avoids shipping font data to the icon route.
 */
export function qkitBrandIcon(size: number): ReactElement {
  return brandIcon(size, {
    monogram: "Q",
    background: BRAND_KHAKI,
    foreground: BRAND_OAT,
    fontFamily: "Georgia, 'Times New Roman', serif",
    radius: size * 0.22,
  });
}
