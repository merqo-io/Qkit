import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk, Space_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Providers } from "@/components/layout/providers";
import { ServiceWorkerRegistrar } from "@/components/layout/service-worker-registrar";
import { MaintenanceBanner } from "@/components/layout/maintenance-banner";
import {
  DEFAULT_PLATFORM_SETTINGS,
  platformSettings,
} from "@/lib/platform-settings";
import { createServerClient } from "@/lib/supabase/server";
import { BRAND_KHAKI } from "@/lib/brand-icon";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Qkit | Live Queueing",
  description: "Scan, order, and track from any food booth in real time.",
  // iOS standalone PWA chrome (status bar + home-screen title).
  appleWebApp: { capable: true, title: "Qkit", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: BRAND_KHAKI,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Anonymous-safe (same client shape as the public order page) — read errors
  // fail closed to "no banner" (DEFAULT_PLATFORM_SETTINGS) rather than
  // breaking every single page load site-wide over a display-only feature.
  // The client is still made on every request: it reads the cookies, which
  // keeps every page rendered per request. Only the query is skipped while a
  // recent answer is remembered, so no page is built once with a banner state
  // frozen into it.
  let banner = DEFAULT_PLATFORM_SETTINGS;
  try {
    const supabase = await createServerClient();
    banner = await platformSettings(async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("banner_enabled, banner_message")
        .eq("id", 1)
        .maybeSingle();
      if (error) console.error("platform_settings read failed", error.message);
      return error ? null : data;
    });
  } catch {
    console.error("platform_settings request failed");
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${hanken.variable} ${spaceMono.variable}`}
    >
      <body>
        <ServiceWorkerRegistrar />
        <MaintenanceBanner
          enabled={banner.banner_enabled}
          message={banner.banner_message}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
