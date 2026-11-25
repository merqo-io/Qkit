import { describe, expect, it } from "vitest";
import { menuItemsInputSchema } from "@/lib/schemas";
import { sampleMenuItems } from "./sample-menu";

describe("sampleMenuItems", () => {
  it("returns Kopi, Teh and Milo with their prices and images", () => {
    expect(
      sampleMenuItems().map(({ name, price_cents, image_url }) => ({
        name,
        price_cents,
        image_url,
      })),
    ).toEqual([
      { name: "Kopi", price_cents: 180, image_url: "/seed/kopi.svg" },
      { name: "Teh", price_cents: 180, image_url: "/seed/teh.svg" },
      { name: "Milo", price_cents: 220, image_url: "/seed/milo.svg" },
    ]);
  });

  it("makes every item available, with no option groups", () => {
    for (const item of sampleMenuItems()) {
      expect(item.available).toBe(true);
      expect(item.option_groups).toBeUndefined();
      expect(item.description.length).toBeGreaterThan(0);
    }
  });

  it("gives fresh unique ids on every call", () => {
    const first = sampleMenuItems().map((i) => i.id);
    const second = sampleMenuItems().map((i) => i.id);
    expect(new Set([...first, ...second]).size).toBe(6);
  });

  it("passes the menu item input schema", () => {
    expect(menuItemsInputSchema.safeParse(sampleMenuItems()).success).toBe(
      true,
    );
  });
});
