import { describe, expect, it } from "vitest";
import { ordersTourSteps, boothsTourSteps } from "./tour-steps";

describe("ordersTourSteps", () => {
  it("returns 7 steps on desktop, 5 on mobile (covers the full order lifecycle, walk-up orders, bump, and auto-clear, not just navigation)", () => {
    expect(ordersTourSteps(false)).toHaveLength(7);
    expect(ordersTourSteps(true)).toHaveLength(5);
  });

  it("anchors every step to a data-tour selector", () => {
    for (const mode of [false, true]) {
      for (const step of ordersTourSteps(mode)) {
        expect(step.element).toMatch(/^\[data-tour="[a-z-]+"\]$/);
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("opens on the order board and ends on the replay button in both modes", () => {
    for (const mode of [false, true]) {
      const steps = ordersTourSteps(mode);
      expect(steps[0].element).toBe('[data-tour="order-board"]');
      expect(steps[steps.length - 1].element).toBe('[data-tour="tour-replay"]');
    }
  });

  it("renders the real OrderStatusBadge markup for the example order, not a hand-copied color", () => {
    const description = ordersTourSteps(false)[0].description;
    expect(description).toContain("status-preparing");
    expect(description).not.toContain('class="tour-example-pill"');
  });

  it("covers the order lifecycle (accept/ready/pickup/payment), bump, and auto-clear before the walk-up-order step", () => {
    for (const mode of [false, true]) {
      const steps = ordersTourSteps(mode);
      expect(steps[0].description).toMatch(/Start now/);
      expect(steps[0].description).toMatch(/Mark Ready/);
      expect(steps[0].description).toMatch(/Mark Picked Up/);
      expect(steps[0].description).toMatch(/Confirm payment received/);
      expect(steps[1].description).toMatch(/bump/i);
      expect(steps[1].description).toMatch(/auto-completes/i);
      expect(steps[2].element).toBe('[data-tour="new-order"]');
    }
  });

  it("desktop spotlights each nav landmark; mobile spotlights the menu instead", () => {
    const desktop = ordersTourSteps(false).map((s) => s.element);
    expect(desktop).toEqual([
      '[data-tour="order-board"]',
      '[data-tour="order-board"]',
      '[data-tour="new-order"]',
      '[data-tour="nav-booths"]',
      '[data-tour="nav-stats"]',
      '[data-tour="nav-plan"]',
      '[data-tour="tour-replay"]',
    ]);

    const mobile = ordersTourSteps(true).map((s) => s.element);
    expect(mobile).toEqual([
      '[data-tour="order-board"]',
      '[data-tour="order-board"]',
      '[data-tour="new-order"]',
      '[data-tour="nav-menu"]',
      '[data-tour="tour-replay"]',
    ]);
    expect(mobile).not.toContain('[data-tour="nav-booths"]'); // hidden behind menu
  });
});

describe("tour guide link", () => {
  it("ends the orders tour by pointing at the user guide on both layouts", () => {
    for (const isMobile of [false, true]) {
      const steps = ordersTourSteps(isMobile);
      expect(steps[steps.length - 1].description).toContain(
        'href="/dashboard/help"',
      );
    }
  });
});

describe("boothsTourSteps", () => {
  it("returns a single step anchored on the always-present New booth control", () => {
    const steps = boothsTourSteps();
    expect(steps).toHaveLength(1);
    expect(steps[0].element).toBe('[data-tour="new-booth"]');
    expect(steps[0].title.length).toBeGreaterThan(0);
    expect(steps[0].description.length).toBeGreaterThan(0);
  });

  it("mentions the menu is required and payment/printing/booking are optional", () => {
    const description = boothsTourSteps()[0].description;
    expect(description).toMatch(/menu/i);
    expect(description).toMatch(/optional/i);
  });
});
