import next from "eslint-config-next";
import sonarjs from "eslint-plugin-sonarjs";

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
    // Commented code is not included in SonarJS's recommended rules.
    ...sonarjs.configs.recommended,
    rules: {
      ...sonarjs.configs.recommended.rules,
      "no-inline-comments": [
        "error",
        {
          ignorePattern:
            "eslint-|@ts-|prettier-|c8 |istanbul |webpackChunkName",
        },
      ],
      "sonarjs/no-commented-code": "error",
      // The TypeScript rule supports our intentional-unused convention.
      "sonarjs/no-unused-vars": "off",
    },
  },
  {
    // JSX callbacks exceed imperative nesting limits without adding complexity.
    files: ["**/*.tsx"],
    plugins: { sonarjs: sonarjsPlugin },
    rules: {
      "sonarjs/no-nested-functions": "off",
    },
  },
  {
    // House convention: no em dash in user-facing copy. Scoped to JSXText,
    // copy-carrying JSX attrs, and toast calls — not every string literal,
    // which would flag internal log/error text out of scope here.
    files: ["**/*.tsx"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.stories.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXText[value=/\\u2014/]",
          message: "No em dash in user-facing text — use a period or comma.",
        },
        {
          selector:
            "JSXAttribute[name.name=/^(aria-label|title|placeholder|label|content|description)$/] > Literal[value=/\\u2014/]",
          message: "No em dash in user-facing text — use a period or comma.",
        },
        {
          selector:
            "CallExpression[callee.object.name='toast'] Literal[value=/\\u2014/]",
          message: "No em dash in user-facing text — use a period or comma.",
        },
      ],
    },
  },
  {
    // The same convention for copy that reaches a person from a `.ts` file:
    // an action's `error` result, a message a mapper returns, a tour step's
    // text. The `.tsx` gate above cannot see these, and a dozen had built up.
    // Still scoped to the shapes that carry copy, not every string literal.
    files: ["src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Property[key.name=/^(error|message|title|description)$/] > Literal[value=/\\u2014/]",
          message: "No em dash in user-facing text — use a period or comma.",
        },
        {
          selector: "ReturnStatement > Literal[value=/\\u2014/]",
          message: "No em dash in user-facing text — use a period or comma.",
        },
      ],
    },
  },
  {
    // Tests and one-off scripts routinely label table-driven cases and
    // fixtures with short trailing notes; that reads better inline, so the
    // gate would be pure noise there.
    files: ["**/*.test.{ts,tsx}", "**/test/**", "scripts/**", "e2e/**"],
    plugins: { sonarjs: sonarjsPlugin },
    rules: {
      "no-inline-comments": "off",
      // Test fixtures routinely nest mocks/describe/it callbacks past
      // sonarjs's 4-level threshold (vi.mock -> describe -> it -> callback is
      // already 4) — a real code-smell signal for imperative app logic, pure
      // noise for test structure.
      "sonarjs/no-nested-functions": "off",
    },
  },
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
    // Local demo tools intentionally resolve ffmpeg and ffprobe from PATH.
    files: ["scripts/**"],
    plugins: { sonarjs: sonarjsPlugin },
    rules: {
      "sonarjs/no-os-command-from-path": "off",
    },
  },
];

export default eslintConfig;
