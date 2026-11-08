import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { servableBoothIds } from "./access";
import { ENTITLEMENTS } from "../plan.fixtures";
import type { Tier } from "../plan";

interface ParityCase {
  name: string;
  tier: Tier;
  booths: { id: string; is_active: boolean; created_at: string }[];
  expected: string[];
}

const TESTS_DIR = join(process.cwd(), "supabase", "tests");
const fixtureText = readFileSync(
  join(TESTS_DIR, "fixtures", "booth-servable.json"),
  "utf8",
);
const fixture = JSON.parse(fixtureText) as { cases: ParityCase[] };

describe("servableBoothIds parity with SQL booth_servable", () => {
  it.each(fixture.cases)("$name", ({ tier, booths, expected }) => {
    const servable = servableBoothIds(booths, ENTITLEMENTS[tier]);
    expect([...servable].sort()).toEqual([...expected].sort());
  });

  it("the pgTAP test embeds the same fixture", () => {
    const sql = readFileSync(
      join(TESTS_DIR, "booth-servable-parity.test.sql"),
      "utf8",
    );
    const embedded = /\$fixture\$([\s\S]*?)\$fixture\$/.exec(sql)?.[1];
    expect(embedded).toBeDefined();
    expect(JSON.parse(embedded ?? "")).toEqual(fixture);
    expect(sql).toContain(`select plan(${fixture.cases.length});`);
  });
});
