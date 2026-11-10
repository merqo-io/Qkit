"use client";

import { cn } from "@merqo/ui/primitives";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/feedback", label: "Feedback" },
];

/** Admin section tabs. Overview matches exactly; others match by prefix. */
export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="mx-auto flex max-w-5xl gap-1 px-5 pt-4">
      {TABS.map((t) => {
        const active =
          t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
