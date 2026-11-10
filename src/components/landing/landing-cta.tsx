"use client";

import Link from "next/link";
import { Button } from "@merqo/ui/primitives";

import { logEvent } from "@/app/actions/events";

interface Props {
  href: string;
  children: React.ReactNode;
  variant?: "default" | "outline";
  className?: string;
  /** Optional analytics event fired on click (fire-and-forget). */
  event?: "landing_cta";
}

/**
 * Landing call-to-action. Client component so it can log an analytics event
 * before navigating; the navigation itself is a normal link (no preventDefault).
 */
export function LandingCta({
  href,
  children,
  variant = "default",
  className,
  event,
}: Props) {
  return (
    <Button asChild size="lg" variant={variant} className={className}>
      <Link href={href} onClick={() => event && void logEvent(event)}>
        {children}
      </Link>
    </Button>
  );
}
