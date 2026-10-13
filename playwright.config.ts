import { defineConfig, devices } from "@playwright/test";
import {
  PAYKIT_MOCK_CALLBACK_SECRET,
  PAYKIT_MOCK_SECRET,
  PAYKIT_MOCK_URL,
} from "./e2e/paykit-mock";

// E2E smoke layer. Deliberately small — a few critical-path flows against a
// REAL local Supabase, covering what the mocked unit/component tests cannot:
// RLS, the proxy.ts auth guard, and the full customer order lifecycle.
//
// Prerequisites to run (see AGENTS.md):
//   1. Docker running, `supabase start`
//   2. apply migrations + the coffee-cart seed
//   3. `pnpm test:e2e` (auto-starts `pnpm dev` via webServer below)
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // List for live console output; also emit an HTML report in CI so a failed
  // run has an uploadable artifact (see .github/workflows/ci.yml).
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Starts the paykit HTTP mock (e2e/paykit-mock.ts) before the dev server
  // is confirmed ready; its return value is used as the matching teardown.
  // No real paykit deployment is reachable in CI, and the checkout-cutover
  // (src/lib/paykit/client.ts) calls it from the order-status page and the
  // pay panel's claim action, so customer-order.spec.ts and order-code.spec.ts
  // need this to reach the "payment sent" / rendered-booth states.
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_PAYKIT_URL: PAYKIT_MOCK_URL,
      PAYKIT_KIT_SECRET: PAYKIT_MOCK_SECRET,
      PAYKIT_CALLBACK_SECRET: PAYKIT_MOCK_CALLBACK_SECRET,
    },
  },
});
