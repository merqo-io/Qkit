"use client";

import { useTheme } from "next-themes";
import Link from "next/link";
import { Toaster } from "sonner";
import { AppLinkProvider } from "@merqo/ui";
import { TooltipProvider } from "@merqo/ui/primitives";

export function Providers({ children }: { children: React.ReactNode }) {
  // Sonner defaults to light whatever the page is; hand it the theme in use.
  const { resolvedTheme } = useTheme();
  return (
    <AppLinkProvider component={Link}>
      <TooltipProvider>
        {children}
        <Toaster
          position="top-right"
          richColors
          theme={resolvedTheme === "dark" ? "dark" : "light"}
        />
      </TooltipProvider>
    </AppLinkProvider>
  );
}
