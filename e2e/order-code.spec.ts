import { test, expect } from "@playwright/test";

// Short-code order entry (order-path hardening). REQUIRES the coffee-cart seed
// (supabase/seed/coffee-cart.sql) — this is the "Kopitiam Cart" booth's
// short_code, same as customer-order.spec.ts.
const CODE = "e2eKopitiam01";

test.describe("order entry code", () => {
  test("valid code renders the order page", async ({ page }) => {
    await page.goto(`/o/${CODE}`);
    await expect(
      page.getByRole("heading", { name: "Kopitiam Cart" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Customize" }).first(),
    ).toBeVisible();
    await expect(page.getByText(/this code expired/i)).not.toBeVisible();
  });

  test("bogus code hard-blocks", async ({ page }) => {
    await page.goto("/o/bogusCodeXXX");
    await expect(page.getByText(/this code expired/i)).toBeVisible();
  });
});
