import { ImageResponse } from "next/og";
import { qkitBrandIcon } from "@/lib/brand";

// 180Ã—180 is Apple's home-screen touch-icon size.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(qkitBrandIcon(180), { ...size });
}
