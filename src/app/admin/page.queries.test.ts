import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

// A query is bounded when it counts with head, carries a date window or limit,
// or resolves to a single row.
const BOUND = /countHead|head: true|\.gte\(|\.limit\(|\.maybeSingle\(/;

function queryChunks(): string[] {
  return source
    .split(/\.from\(/)
    .slice(1)
    .map((chunk) => chunk.split(/\.from\(|;/)[0]);
}

describe("admin overview queries", () => {
  it("finds the page's queries", () => {
    expect(queryChunks().length).toBeGreaterThanOrEqual(10);
  });

  it("bounds every query with a count-head, a date window or a limit", () => {
    const unbounded = queryChunks().filter((chunk) => !BOUND.test(chunk));
    expect(unbounded.map((chunk) => chunk.slice(0, 40))).toEqual([]);
  });
});
