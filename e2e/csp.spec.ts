import { test, expect, type Page } from "@playwright/test";

function watchCsp(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) {
      problems.push(m.text());
    }
  });
  page.on("pageerror", (e) => problems.push(e.message));
  return problems;
}

// Dev keeps the static policy (React needs eval); the public-smoke job serves the production build.
test.describe("nonce CSP", () => {
  // Intentional, conditional skip: the nonce policy only exists in a production build.
  test.skip(!process.env.E2E_PROD, "nonce CSP is production-only");

  for (const path of ["/", "/login"]) {
    test(`${path} runs its scripts under a nonce CSP`, async ({ page }) => {
      const problems = watchCsp(page);
      const response = await page.goto(path);
      const csp = response?.headers()["content-security-policy"] ?? "";

      expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(await page.locator("script[nonce]").count()).toBeGreaterThan(0);
      await page.waitForLoadState("networkidle");
      expect(problems).toEqual([]);
    });
  }
});
