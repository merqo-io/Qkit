// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ShowcaseVendor } from "./showcase-vendors";
import { SHOWCASE_LAYOUT, VendorShowcase } from "./vendor-showcase";

function makeVendors(count: number, withLogo = false): ShowcaseVendor[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Test Stall ${i + 1}`,
    logoUrl: withLogo ? `https://example.test/logo-${i + 1}.png` : null,
    kind: i === 0 ? "Noodles" : null,
  }));
}

function layoutOf(container: HTMLElement) {
  return container.querySelector("[data-layout]")?.getAttribute("data-layout");
}

describe("VendorShowcase", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<VendorShowcase vendors={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a static row without a duplicate track for 2 vendors", () => {
    const { container } = render(<VendorShowcase vendors={makeVendors(2)} />);
    expect(layoutOf(container)).toBe("row");
    expect(container.querySelector("[data-marquee-track]")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "Vendors on qkit" }),
    ).toBeTruthy();
  });

  it("renders a marquee with an aria-hidden duplicate for 6 vendors", () => {
    const { container } = render(<VendorShowcase vendors={makeVendors(6)} />);
    expect(layoutOf(container)).toBe("marquee");
    const dup = container.querySelector("[data-marquee-duplicate]");
    expect(dup?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByRole("list")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getAllByText("Test Stall 1")).toHaveLength(2);
    expect(container.querySelectorAll("[data-vendor-chip]")).toHaveLength(12);
  });

  it("renders a grid of cards with the kind for 12 vendors", () => {
    const { container } = render(<VendorShowcase vendors={makeVendors(12)} />);
    expect(layoutOf(container)).toBe("grid");
    expect(container.querySelector("[data-marquee-track]")).toBeNull();
    expect(container.querySelectorAll("[data-vendor-card]")).toHaveLength(12);
    expect(screen.getByText("Noodles")).toBeTruthy();
  });

  it("exports the layout thresholds", () => {
    expect(SHOWCASE_LAYOUT).toEqual({ marqueeMin: 4, gridMin: 12 });
  });

  it("renders a lazy logo image when logoUrl is set", () => {
    render(<VendorShowcase vendors={makeVendors(2, true)} />);
    const img = screen.getByAltText("Test Stall 1");
    expect(img.getAttribute("src")).toBe("https://example.test/logo-1.png");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("width")).toBe("32");
  });

  it("renders an initials chip when there is no logo", () => {
    const { container } = render(<VendorShowcase vendors={makeVendors(2)} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText("TS")).toHaveLength(2);
  });
});
