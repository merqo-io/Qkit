import { test, expect, type Page } from "@playwright/test";
import { BOOTH, placeClaimedOrder } from "./customer-flow";
import { E2E_BASE_URL } from "./paykit-mock";
import { signInSeedVendor } from "./vendor-auth";

// The board's whole fulfillment path for one QR order, against the real
// local Supabase: the vendor starts it (confirming the claimed payment),
// marks it ready and hands it over, while the customer's status page and the
// booth's TV screen follow along. Requires the coffee-cart seed.

// Other specs leave their own orders on the seeded booth's board, so every
// lookup is scoped to this order's ticket, never to the board as a whole.
function ticket(board: Page, number: string) {
  const menu = board.getByRole("button", {
    name: `More actions for order #${number}`,
  });
  const action = board.getByRole("button", {
    name: /Mark paid & start|Start now|Mark Ready|Mark Picked Up|Undo/,
  });
  // The innermost element holding both the ticket's menu and its next-step
  // button is the ticket itself.
  return {
    menu,
    card: board
      .locator("div")
      .filter({ has: menu })
      .filter({ has: action })
      .last(),
  };
}

test("vendor starts, readies and hands over a customer's order", async ({
  browser,
  baseURL,
}) => {
  // Two browsers' worth of polling (5s each) plus the board's 4s undo window
  // per step, on a dev server compiling the dashboard for the first time.
  test.setTimeout(180_000);

  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const number = await placeClaimedOrder(customer, "Grace");

  const vendorContext = await browser.newContext();
  await signInSeedVendor(vendorContext, baseURL ?? E2E_BASE_URL);
  const board = await vendorContext.newPage();
  await board.goto("/dashboard");
  await expect(board).toHaveURL(/\/dashboard$/);

  const { menu, card } = ticket(board, number);
  await expect(menu).toBeVisible({ timeout: 30_000 });

  // A claimed payment folds confirm-and-start into one tap.
  await card.getByRole("button", { name: /Mark paid & start/ }).click();
  const markReady = card.getByRole("button", { name: "Mark Ready" });
  await expect(markReady).toBeVisible({ timeout: 20_000 });
  await markReady.click();

  // The customer's page polls; it turns to ready on its own.
  await expect(customer.getByText("It's ready").first()).toBeVisible({
    timeout: 30_000,
  });

  // The booth's TV screen lists the number under "Ready for pickup".
  const tv = await customerContext.newPage();
  await tv.goto(`/order/${BOOTH}/display`);
  const readyColumn = tv
    .locator("section")
    .filter({ has: tv.getByRole("heading", { name: "Ready for pickup" }) });
  await expect(readyColumn.getByText(number, { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  const pickedUp = card.getByRole("button", { name: "Mark Picked Up" });
  await expect(pickedUp).toBeVisible({ timeout: 20_000 });
  await pickedUp.click();

  // Off the board once the undo window closes, and collected on both screens.
  await expect(menu).toHaveCount(0, { timeout: 30_000 });
  await expect(customer.getByText("Collected. Enjoy!").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(readyColumn.getByText(number, { exact: true })).toHaveCount(0, {
    timeout: 20_000,
  });

  await vendorContext.close();
  await customerContext.close();
});
