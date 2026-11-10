import { ImageResponse } from "next/og";
import { qkitBrandIcon } from "@/lib/brand";

export function GET() {
  return new ImageResponse(qkitBrandIcon(512), { width: 512, height: 512 });
}
