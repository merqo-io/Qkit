import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("globals.css", () => {
  it("keeps the sheet scrim at black 50%", () => {
    expect(css).toMatch(
      /\[data-slot="sheet-overlay"\]\s*\{[^}]*background-color:\s*rgb\(0 0 0 \/ 0\.5\)/,
    );
  });
});
