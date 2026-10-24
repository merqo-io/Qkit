/* eslint-disable no-restricted-syntax -- ImageResponse needs literal CSS colours */
import type { ReactElement } from "react";

// Hex approximations of the `--primary` khaki on chalk-cream paper.
export const BRAND_KHAKI = "#bc892b";
export const BRAND_OAT = "#efe3c8";

/**
 * The qkit "Q" app mark for ImageResponse-generated icons (favicon, manifest,
 * apple-touch). A system serif stands in for Fraunces — fine at icon scale and
 * avoids shipping font data to the icon route.
 */
export function brandIcon(size: number): ReactElement {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_KHAKI,
        color: BRAND_OAT,
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontWeight: 700,
        fontSize: size * 0.62,
        lineHeight: 1,
        borderRadius: size * 0.22,
      }}
    >
      Q
    </div>
  );
}
