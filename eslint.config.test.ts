import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const ERROR = 2;

describe("eslint config", () => {
  let rules: Record<string, unknown> = {};

  beforeAll(async () => {
    const config = await new ESLint().calculateConfigForFile(
      "src/app/layout.tsx",
    );
    rules = config.rules ?? {};
  }, 60_000);

  it.each([
    "no-inline-comments",
    "sonarjs/no-commented-code",
    "eslint-comments/require-description",
    "max-lines",
    "no-restricted-syntax",
    "@typescript-eslint/no-use-before-define",
  ])("%s resolves to error for app source", (rule) => {
    const setting = rules[rule];
    expect(Array.isArray(setting) ? setting[0] : setting).toBe(ERROR);
  });
});
