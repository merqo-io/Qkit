import { expect, type Page } from "@playwright/test";

// The seeded "Kopitiam Cart" booth (supabase/seed/coffee-cart.sql) and its
// fixed test-only short code. Keep in sync with the seed.
export const BOOTH = "c0ffee01-0000-4000-8000-000000000001";
export const CODE = "e2eKopitiam01";

/**
 * Places an order on the seeded booth as a customer named `name`, pays on
 * the paykit mock's stub page and returns on the live status page, where the
 * claimed order waits for the vendor. Returns the order number the status
 * page shows (the same number the board and the TV screen show).
 */
export async function placeClaimedOrder(
  page: Page,
  name: string,
): Promise<string> {
  await page.goto(`/o/${CODE}`);

  const customize = page.getByRole("button", { name: "Customize" }).first();
  await expect(customize).toBeVisible();

  // The first choices are preselected, so this customization is valid without extra picks.
  await customize.click();
  await page.getByRole("button", { name: "Add to order" }).click();

  await page.getByRole("button", { name: /Continue/ }).click();
  const checkout = page.getByRole("dialog");
  await checkout.getByLabel("Your name").fill(name);
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
  await expect(page).toHaveURL(new RegExp(`/order/${BOOTH}/\\d+\\?t=`));

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(/^#\d+$/);
  return ((await heading.textContent()) ?? "").replace("#", "").trim();
}
