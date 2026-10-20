import { test, expect } from "@playwright/test";
import { placeClaimedOrder } from "./customer-flow";

// Real Supabase checkout, the redirect to paykit's pay page (a stub), the
// return and initial tracking; requires the coffee-cart seed.
test("customer places an order and reaches the live status page", async ({
  page,
}) => {
  await placeClaimedOrder(page, "Ada");

  // The seed has no printer, so the claimed order still awaits vendor acceptance.
  await expect(
    page.getByText(/the stall will start on it shortly/i),
  ).toBeVisible();
  await expect(page.getByText(/payment sent/i)).toBeVisible();
});
