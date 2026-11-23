import { test, expect } from "@playwright/test";

test("landing renders", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Take orders,\s*not queues/,
    }),
  ).toBeVisible();
});

test("login renders", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: /Continue with Google/ }),
  ).toBeVisible();
});
