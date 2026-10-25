import { test, expect } from "@playwright/test";
import { BOOTH } from "./customer-flow";
import { E2E_BASE_URL } from "./paykit-mock";
import {
  SEED_VENDOR_ID,
  signInSeedAdmin,
  signInSeedVendor,
} from "./vendor-auth";

// Every dashboard page renders for the seeded vendor, and every admin page for
// a dedicated admin cleared through TOTP. Requires the coffee-cart seed.
test("every dashboard page renders signed in", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext();
  await signInSeedVendor(context, baseURL ?? E2E_BASE_URL);
  const page = await context.newPage();

  // Dynamic: Playwright loads specs as CJS and the helper is ESM-only.
  const { renderSmoke } = await import("@merqo/ui/testing");
  const failures = await renderSmoke(page, [
    "/dashboard",
    "/dashboard/booths",
    "/dashboard/booths/new",
    `/dashboard/booths/${BOOTH}`,
    `/dashboard/booths/${BOOTH}/menu`,
    `/dashboard/booths/${BOOTH}/qr`,
    "/dashboard/completed",
    "/dashboard/feedback",
    "/dashboard/plan",
    "/dashboard/profile",
    "/dashboard/settings",
    "/dashboard/stats",
  ]);

  expect(failures).toEqual([]);
  await context.close();
});

test("every admin page renders for an admin with MFA cleared", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const context = await browser.newContext();
  await signInSeedAdmin(context, baseURL ?? E2E_BASE_URL);
  const page = await context.newPage();

  const { renderSmoke } = await import("@merqo/ui/testing");
  const failures = await renderSmoke(page, [
    "/admin",
    "/admin/feedback",
    "/admin/vendors",
    `/admin/vendors/${SEED_VENDOR_ID}`,
  ]);

  expect(failures).toEqual([]);
  await context.close();
});

test("a password-only admin session is sent to /mfa", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext();
  await signInSeedAdmin(context, baseURL ?? E2E_BASE_URL, { mfa: false });
  const page = await context.newPage();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/mfa/);
  await context.close();
});
