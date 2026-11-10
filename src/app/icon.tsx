import { ImageResponse } from "next/og";
import { qkitBrandIcon } from "@/lib/brand";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Favicon / tab icon.
export default function Icon() {
  return new ImageResponse(qkitBrandIcon(32), { ...size });
}
