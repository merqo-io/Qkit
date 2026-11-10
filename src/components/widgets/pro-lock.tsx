"use client";

import { ProLock as SharedProLock } from "@merqo/ui";
import { logEvent } from "@/app/actions/events";

/**
 * Contextual upgrade nudge shown inline at a gated feature. Naming the specific
 * feature (and logging which one was clicked) is what makes these convert far
 * better than a generic banner, and the per-feature signal feeds the admin
 * funnel so we learn which gate drives demand. The pill itself is the shared
 * `ProLock`; this wrapper binds qkit's plan route and click logging.
 */
export function ProLock({
  feature,
  label,
}: {
  feature: string;
  label: string;
}) {
  return (
    <SharedProLock
      href="/dashboard/plan"
      label={label}
      onClick={() => void logEvent("upgrade_cta", { feature })}
    />
  );
}
