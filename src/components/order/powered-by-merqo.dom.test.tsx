// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PoweredByMerqo } from "./powered-by-merqo";

describe("PoweredByMerqo", () => {
  it("links to merqo.io", () => {
    render(<PoweredByMerqo />);
    expect(
      screen.getByRole("link", { name: "Powered by Merqo" }),
    ).toHaveAttribute("href", "https://merqo.io");
  });
});
