import next from "eslint-config-next";
import sonarjs from "eslint-plugin-sonarjs";
import { merqoEslintPreset, merqoNoLocalCopies } from "@merqo/ui/eslint";

// Reuse Next's plugin instance to avoid duplicate registration.
const typescriptEslintPlugin = next.find((c) => c.name === "next/typescript")
  .plugins["@typescript-eslint"];

// ESLint requires identical plugin objects across flat-config blocks.
const sonarjsPlugin = sonarjs.configs.recommended.plugins.sonarjs;

const eslintConfig = [
  ...next,
  {
    ignores: [
      "node_modules/**",
      ".pnpm-store/**",
      ".next/**",
      "supabase/**",
      "coverage/**",
      ".stryker-tmp/**",
      "reports/**",
      "test-results/**",
      "playwright-report/**",
      "scripts/demo/out/**",
      ".worktrees/**",
      ".claude/worktrees/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": typescriptEslintPlugin },
    rules: {
      // Underscore-prefixed names mark intentionally unused values.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // A `const` read from inside a closure that is built before the
      // declaration runs is a temporal-dead-zone crash at request time, not a
      // type error: tsc only flags a direct read in the same scope. One of
      // those took the vendor order board down in production (a booth .map
      // reading a `cupsToday` declared below it) with every other gate green,
      // so this is an error rather than a warning. Functions and types are
      // exempt: hoisted declarations below their use are the house style for
      // component helpers.
      "@typescript-eslint/no-use-before-define": [
        "error",
        {
          functions: false,
          classes: false,
          variables: true,
          enums: false,
          typedefs: false,
          ignoreTypeReferences: true,
        },
      ],
    },
  },
  {
    ...sonarjs.configs.recommended,
    rules: {
      ...sonarjs.configs.recommended.rules,
      // The TypeScript rule supports our intentional-unused convention.
      "sonarjs/no-unused-vars": "off",
    },
  },
  ...merqoEslintPreset({ sonarjsPlugin, tsPlugin: typescriptEslintPlugin }),
  ...merqoNoLocalCopies({
    // Each entry is a thin wrapper that binds qkit config to the shared piece
    // (or adds qkit-only behaviour), so importing it is intentional.
    allow: [
      // Bind the qkit schema, env keys and cookie domain to the shared clients.
      "lib/supabase/client",
      "lib/supabase/server",
      "lib/supabase/middleware",
      // Binds the qkit check_rate_limit RPC store and the trusted IP headers.
      "lib/rate-limit",
      // Keeps the ok/fail builders, which the shared package does not ship.
      "lib/action-result",
      // Binds the qkit cache client and merqo secret; adds the page guard.
      "lib/legal-gate",
      // Adds the qkit toast on top of the shared hook.
      "hooks/use-async-action",
      // Supplies qkit's tour steps and seen-marker to the shared tours.
      "components/tour/dashboard-tour",
      // Binds the qkit plan route and upgrade-click logging.
      "components/widgets/pro-lock",
      // Mints the qkit order-scoped connect token before rendering the shared button.
      "app/order/[boothId]/[orderNumber]/telegram-connect",
    ],
  }),
  {
    // Synthetic test identities and random fixture IDs are not credentials.
    files: ["**/*.test.{ts,tsx}", "**/test/**", "e2e/**"],
    plugins: { sonarjs: sonarjsPlugin },
    rules: {
      "sonarjs/no-hardcoded-ip": "off",
      "sonarjs/no-hardcoded-passwords": "off",
      "sonarjs/pseudo-random": "off",
      // A vi.mock factory reads fixture constants declared below it. vitest
      // hoists the vi.mock call above the imports but only invokes the factory
      // when the mocked module is first loaded, by which time the constant
      // exists, so the pattern is safe here and common enough that the gate
      // would be noise.
      "@typescript-eslint/no-use-before-define": "off",
    },
  },
  {
    // advanceOrder and confirmPaymentAndStart exceed the complexity limits; a
    // function-level split is tracked separately.
    files: [
      "src/app/dashboard/order-advance-actions.ts",
      "src/app/dashboard/order-payment-actions.ts",
    ],
    rules: {
      complexity: "off",
      "sonarjs/cognitive-complexity": "off",
    },
  },
  {
    // Form components whose branching is optional JSX (plan locks, conditional fields), not control flow.
    files: [
      "src/app/dashboard/booths/booth-form.tsx",
      "src/app/dashboard/settings/settings-form.tsx",
    ],
    rules: {
      complexity: "off",
    },
  },
  {
    // Over the complexity limit; each is split with its page or component later.
    files: [
      "src/app/admin/feedback/page.tsx",
      "src/app/admin/page.tsx",
      "src/app/admin/vendors/[[]id]/page.tsx",
      "src/app/dashboard/booths/printing-section.tsx",
      "src/app/dashboard/plan/page.tsx",
      "src/app/dashboard/stats/stats-view.tsx",
      "src/app/order/[[]boothId]/[[]orderNumber]/page.tsx",
      "src/components/board/order-card-parts.tsx",
    ],
    rules: { complexity: "off" },
  },
  {
    // Local demo tools intentionally resolve ffmpeg and ffprobe from PATH.
    files: ["scripts/**"],
    plugins: { sonarjs: sonarjsPlugin },
    rules: {
      "sonarjs/no-os-command-from-path": "off",
    },
  },
  {
    // The service client bypasses RLS: keep it in lib helpers and bearer-gated
    // route handlers. A Server Action that needs it states why on the import.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/**", "src/app/api/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/server",
              importNames: ["createServiceClient"],
              message:
                "Service-role client bypasses RLS. Use it only in src/lib or src/app/api, or justify with an eslint-disable description.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
