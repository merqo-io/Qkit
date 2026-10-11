"use client";

import { useTheme } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  // Sonner defaults to light whatever the page is; hand it the theme in use.
  const { resolvedTheme } = useTheme();
  return (
    <TooltipProvider>
      {children}
      <Toaster
        position="top-right"
        richColors
        theme={resolvedTheme === "dark" ? "dark" : "light"}
      />
    </TooltipProvider>
  );
}
