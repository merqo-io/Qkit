const PAYKIT_FALLBACK_URL = "https://paykit.merqo.io";

/**
 * paykit's payment setup page, optionally carrying `returnTo` as the way back.
 * paykit decides whether to honour the address; qkit only encodes it.
 */
export function paykitSetupUrl(
  returnTo: string | null,
  base: string = process.env.NEXT_PUBLIC_PAYKIT_URL ?? PAYKIT_FALLBACK_URL,
): string {
  const url = new URL("/dashboard/config", base);
  if (returnTo) url.searchParams.set("return_to", returnTo);
  return url.href;
}
