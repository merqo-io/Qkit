import type { MetadataRoute } from "next";
import { BRAND_KHAKI, BRAND_OAT } from "@/lib/brand-icon";

// `display: standalone` is what makes the app installable, and iOS only enables
// Web Notifications for a PWA added to the home screen in standalone mode.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "qkit: booth ordering",
    short_name: "qkit",
    description: "Scan, order, and track from any food booth in real time.",
    start_url: "/",
    display: "standalone",
    background_color: BRAND_OAT,
    theme_color: BRAND_KHAKI,
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
