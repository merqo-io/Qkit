// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({ notFound }));

import HelpIndexPage from "./page";
import HelpArticlePage, { generateStaticParams } from "./[slug]/page";
import {
  ALL_HELP_ARTICLES,
  HELP_CATEGORIES,
  publishedArticles,
} from "@/content/help";

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
    expect(screen.getByRole("link", { name: /Payments/ })).toHaveAttribute(
      "href",
      "/dashboard/help/payments",
    );
  });

  it("shows no coming soon marker once every category is published", () => {
    render(<HelpIndexPage />);
    expect(screen.queryByText("Coming soon.")).toBeNull();
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

  it("404s an unknown slug", async () => {
    await expect(
      HelpArticlePage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("pre-renders published slugs only", () => {
    const params = generateStaticParams();
    expect(params).toEqual(publishedArticles().map((a) => ({ slug: a.slug })));
    for (const { slug } of params) {
      const entry = ALL_HELP_ARTICLES.find((a) => a.slug === slug);
      expect(entry).toBeDefined();
      expect(entry?.draft).toBeFalsy();
    }
  });
});
