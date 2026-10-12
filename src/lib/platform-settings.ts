import type { PlatformSettings } from "@/lib/types";

/** Shape the root layout + admin form consume (subset of the `platform_settings` row). */
export type PlatformSettingsConfig = Pick<
  PlatformSettings,
  "banner_enabled" | "banner_message"
>;

/**
 * Fallback when the `platform_settings` row can't be read (e.g. pre-migration
 * or a transient error). Off, so a read failure never accidentally shows a
 * stale/wrong banner to every visitor.
 */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsConfig = {
  banner_enabled: false,
  banner_message: "",
};

/** How long one server instance trusts its last successful read. */
export const PLATFORM_SETTINGS_TTL_MS = 30_000;

let remembered: { value: PlatformSettingsConfig; at: number } | null = null;

/**
 * The banner settings, read at most once per PLATFORM_SETTINGS_TTL_MS by each
 * server instance. The root layout asks on every page request, and the answer
 * is the same row for every visitor and changes a few times a year.
 *
 * `read` returns null when the row could not be read. A failed read is not
 * remembered, so the next request tries again, and it never replaces a good
 * answer with the fallback for longer than that one request.
 *
 * The cost is that a banner switched on in /admin reaches another warm
 * instance up to PLATFORM_SETTINGS_TTL_MS late. The instance that saved it
 * forgets at once (see `forgetPlatformSettings`).
 */
export async function platformSettings(
  read: () => Promise<PlatformSettingsConfig | null>,
  nowMs: number = Date.now(),
): Promise<PlatformSettingsConfig> {
  if (remembered && nowMs - remembered.at < PLATFORM_SETTINGS_TTL_MS)
    return remembered.value;
  const value = await read();
  if (!value) return DEFAULT_PLATFORM_SETTINGS;
  remembered = { value, at: nowMs };
  return value;
}

/** Drop the remembered settings, so the next request reads the row again. */
export function forgetPlatformSettings(): void {
  remembered = null;
}
