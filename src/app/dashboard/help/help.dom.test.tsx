// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({ notFound }));

import HelpIndexPage from "./page";
import HelpArticlePage, { generateStaticParams } from "./[slug]/page";
import { HELP_CATEGORIES } from "@/content/help";

describe("help index", () => {
  it("lists all eight categories and links published articles only", () => {
    render(<HelpIndexPage />);
    for (const category of HELP_CATEGORIES) {
      expect(
        screen.getByRole("heading", { level: 2, name: category.title }),
      ).toBeInTheDocument();
    }
    expect(HELP_CATEGORIES).toHaveLength(8);
    expect(
      screen.getByRole("link", { name: /Troubleshooting/ }),
    ).toHaveAttribute("href", "/dashboard/help/troubleshooting");
    expect(screen.queryByRole("link", { name: /Payments/ })).toBeNull();
  });

  it("marks categories that only have drafts as coming soon", () => {
    render(<HelpIndexPage />);
    const payments = screen
      .getByRole("heading", { name: "Payments" })
      .closest("section");
    expect(
      within(payments as HTMLElement).getByText("Coming soon."),
    ).toBeVisible();
    const troubleshooting = screen
      .getByRole("heading", { name: "Troubleshooting" })
      .closest("section");
    expect(
      within(troubleshooting as HTMLElement).queryByText("Coming soon."),
    ).toBeNull();
  });
});

describe("help article page", () => {
  it("renders the troubleshooting article", async () => {
    render(
      await HelpArticlePage({
        params: Promise.resolve({ slug: "troubleshooting" }),
      }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Troubleshooting" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "I regenerated my QR and my printed codes stopped working",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /paykit/ })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "User guide" })).toHaveAttribute(
      "href",
      "/dashboard/help",
    );
  });

  it("404s a draft and an unknown slug", async () => {
    await expect(
      HelpArticlePage({ params: Promise.resolve({ slug: "payments" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      HelpArticlePage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(2);
  });

  it("pre-renders published slugs only", () => {
    expect(generateStaticParams()).toEqual([{ slug: "troubleshooting" }]);
  });
});
