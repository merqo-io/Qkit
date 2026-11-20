// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FaqRoute from "./page";
import { FAQ_GROUPS } from "./faq-content";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => Promise.resolve({ auth: { getUser } }),
}));

describe("FaqRoute", () => {
  it("renders all four groups and the ten questions", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    render(await FaqRoute());

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Frequently asked questions",
      }),
    ).toBeInTheDocument();
    for (const heading of [
      "Getting started",
      "Day to day",
      "Money and payment",
      "Cost and pilot",
    ]) {
      expect(
        screen.getByRole("heading", { level: 2, name: heading }),
      ).toBeInTheDocument();
    }
    const rows = FAQ_GROUPS.flatMap((g) => g.rows);
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(screen.getByText(row.q)).toBeInTheDocument();
    }
  });

  it("uses the paykit PayNow answer", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    render(await FaqRoute());

    expect(
      screen.getByText(/^Yes, through paykit, a separate Merqo app/),
    ).toBeInTheDocument();
  });

  it("has no closing line and emits FAQPage JSON-LD", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { container } = render(await FaqRoute());

    expect(container.querySelector("hr")).toBeNull();
    expect(screen.queryByText(/Email legal@merqo\.io\.$/)).toBeNull();
    const ld = container.querySelector('script[type="application/ld+json"]');
    expect(ld).not.toBeNull();
    const data = JSON.parse(ld?.textContent ?? "{}");
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(10);
  });

  it("includes the nav and the footer, and shows Dashboard when signed in", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "vendor@example.com" } },
    });
    render(await FaqRoute());

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByText("a Merqo kit")).toBeInTheDocument();
  });

  it("keeps the copy free of prices, plan names, readiness claims and dashes", () => {
    const text = FAQ_GROUPS.flatMap((g) =>
      g.rows.map((r) => `${r.q} ${r.a}`),
    ).join(" ");
    expect(text).not.toContain("$");
    expect(text).not.toContain("—");
    expect(text).not.toContain("!");
    expect(text).not.toMatch(/\bPro\b/);
    expect(text).not.toMatch(/event pass|monthly|day pass|beta|free plan/i);
    expect(text).not.toMatch(
      /\b(live|now|available today|proven|shopkit|reachkit|Pte|GST)\b/i,
    );
  });
});
