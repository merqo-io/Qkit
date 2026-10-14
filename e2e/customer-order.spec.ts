import { test, expect } from "@playwright/test";

// Real Supabase checkout, the redirect to paykit's pay page (a stub), the
// return and initial tracking; requires the coffee-cart seed.
const BOOTH = "c0ffee01-0000-4000-8000-000000000001";

// Must match the fixed test-only short code in the coffee-cart seed.
const CODE = "e2eKopitiam01";

test("customer places an order and reaches the live status page", async ({
  page,
}) => {
  await page.goto(`/o/${CODE}`);

  const customize = page.getByRole("button", { name: "Customize" }).first();
  await expect(customize).toBeVisible();

  // The first choices are preselected, so this customization is valid without extra picks.
  await customize.click();
  await page.getByRole("button", { name: "Add to order" }).click();

  await page.getByRole("button", { name: /Continue/ }).click();
  const checkout = page.getByRole("dialog");
  await checkout.getByLabel("Your name").fill("Ada");
  await checkout.getByRole("button", { name: /Place order/ }).click();

  // Payment-required orders have no number until payment is claimed. The
  // pay step sends the customer to paykit's page (the mock stands in for it).
  await page.waitForURL(/\/pay\/mock-tx-\d+\?k=mock/);
  await expect(
    page.getByRole("heading", { name: /pay on paykit/i }),
  ).toBeVisible();

  // paykit claims the payment and sends the customer back to qkit, whose pay
  // step gives the order its number and moves on to the status page.
  await page.getByRole("button", { name: /i've paid/i }).click();

  // The seed has no printer, so the claimed order still awaits vendor acceptance.
  await expect(page).toHaveURL(new RegExp(`/order/${BOOTH}/\\d+\\?t=`));
  await expect(
    page.getByText(/the stall will start on it shortly/i),
  ).toBeVisible();
  await expect(page.getByText(/payment sent/i)).toBeVisible();
});
