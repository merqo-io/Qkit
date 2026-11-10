import { ImageResponse } from "next/og";
import { qkitBrandIcon } from "@/lib/brand";

// Stable-URL PNG for the web manifest (the generated app-dir icon URLs carry a
// hash, which can't be referenced from manifest.ts).
export function GET() {
  return new ImageResponse(qkitBrandIcon(192), { width: 192, height: 192 });
}
