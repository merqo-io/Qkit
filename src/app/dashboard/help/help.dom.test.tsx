// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const nav = vi.hoisted(() => ({ pathname: "/dashboard/help", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound,
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push }),
}));

const loadVote = vi.hoisted(() =>
  vi.fn(async () => ({ available: true, vote: null }) as unknown),
);
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({}),
}));
vi.mock("@/lib/help/feedback-queries", () => ({ loadMyHelpVote: loadVote }));
vi.mock("./feedback-actions", () => ({ submitHelpFeedback: vi.fn() }));

import HelpIndexPage from "./page";
import HelpLayout from "./layout";
import HelpArticlePage, { generateStaticParams } from "./[slug]/page";
import {
  ALL_HELP_ARTICLES,
  HELP_CATEGORIES,
  POPULAR_HELP_SLUGS,
  orderedArticles,
  publishedArticles,
} from "@/content/help";

describe("help layout sidebar", () => {
  it("lists categories and articles and marks the current one", () => {
    nav.pathname = "/dashboard/help/payments";
    render(<HelpLayout>content</HelpLayout>);
    const sidebar = screen.getByRole("navigation", {
      name: "Help topics sidebar",
      hidden: true,
    });
    for (const category of HELP_CATEGORIES) {
      expect(
        within(sidebar).getAllByText(category.title).length,
      ).toBeGreaterThan(0);
    }
    const current = within(sidebar).getByRole("link", { name: "Payments" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveAttribute("href", "/dashboard/help/payments");
    expect(
      within(sidebar).getByRole("link", { name: "Printing" }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Help home" })).toHaveAttribute(
      "href",
      "/dashboard/help",
    );
    const summary = screen.getByText("Browse topics");
    const disclosure = summary.closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure).toHaveClass("lg:hidden");
    expect(
      within(disclosure as HTMLElement).getByRole("link", { name: "Payments" }),
    ).toHaveAttribute("aria-current", "page");
  });
});

describe("help search", () => {
  it("finds an article by a title word", async () => {
    nav.pathname = "/dashboard/help/payments";
    render(<HelpLayout>content</HelpLayout>);
    await userEvent.type(
      screen.getByRole("combobox", { name: "Search the user guide" }),
      "printing",
    );
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Printing");
    expect(
      within(options[0]).getByRole("link", { hidden: true }),
    ).toHaveAttribute("href", "/dashboard/help/printing");
  });

  it("finds an article by a body word", async () => {
    nav.pathname = "/dashboard/help/payments";
    render(<HelpLayout>content</HelpLayout>);
    await userEvent.type(
      screen.getByRole("combobox", { name: "Search the user guide" }),
      "regenerated",
    );
    expect(screen.getAllByRole("option")[0]).toHaveTextContent(
      "Troubleshooting",
    );
  });

  it("suggests troubleshooting when nothing matches, and Esc clears", async () => {
    nav.pathname = "/dashboard/help/payments";
    render(<HelpLayout>content</HelpLayout>);
    const input = screen.getByRole("combobox", {
      name: "Search the user guide",
    });
    await userEvent.type(input, "zzzqqq");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "Try the Troubleshooting guide" }),
    ).toHaveAttribute("href", "/dashboard/help/troubleshooting");
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  it("navigates the highlighted result with Enter and focuses on slash", async () => {
    nav.pathname = "/dashboard/help/payments";
    nav.push.mockClear();
    render(<HelpLayout>content</HelpLayout>);
    const input = screen.getByRole("combobox", {
      name: "Search the user guide",
    });
    await userEvent.keyboard("/");
    expect(input).toHaveFocus();
    await userEvent.type(input, "printing");
    await userEvent.keyboard("{Enter}");
    expect(nav.push).toHaveBeenCalledWith("/dashboard/help/printing");
  });
});

describe("help search lifecycle", () => {
  it("clears the query when the route changes and when a result is clicked", async () => {
    nav.pathname = "/dashboard/help/payments";
    const { rerender } = render(<HelpLayout>content</HelpLayout>);
    const input = screen.getByRole("combobox", {
      name: "Search the user guide",
    });
    await userEvent.type(input, "printing");
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    nav.pathname = "/dashboard/help/printing";
    rerender(<HelpLayout>content</HelpLayout>);
    expect(input).toHaveValue("");
    await userEvent.type(input, "printing");
    await userEvent.click(
      within(screen.getAllByRole("option")[0]).getByRole("link", {
        hidden: true,
      }),
    );
    expect(input).toHaveValue("");
  });

  it("shows a single search input on help home", () => {
    nav.pathname = "/dashboard/help";
    render(
      <HelpLayout>
        <HelpIndexPage />
      </HelpLayout>,
    );
    expect(
      screen.getAllByRole("combobox", { name: "Search the user guide" }),
    ).toHaveLength(1);
  });
});

describe("help index", () => {
  it("renders a category card for each of the eight categories", () => {
    nav.pathname = "/dashboard/help";
    render(<HelpIndexPage />);
    expect(HELP_CATEGORIES).toHaveLength(8);
    const topics = screen.getByRole("region", { name: "Browse by topic" });
    for (const category of HELP_CATEGORIES) {
      expect(within(topics).getByText(category.title)).toBeInTheDocument();
    }
    expect(
      within(topics).getByRole("link", { name: /Troubleshooting/ }),
    ).toHaveAttribute("href", "/dashboard/help/troubleshooting");
  });

  it("lists the popular articles", () => {
    nav.pathname = "/dashboard/help";
    render(<HelpIndexPage />);
    const popular = screen.getByRole("region", { name: "Popular articles" });
    expect(within(popular).getAllByRole("link")).toHaveLength(
      POPULAR_HELP_SLUGS.length,
    );
    expect(
      within(popular).getByRole("link", { name: /Getting started/ }),
    ).toHaveAttribute("href", "/dashboard/help/getting-started");
  });
});

describe("help article page", () => {
  it("shows the feedback widget, and hides it when the table is unavailable", async () => {
    const { unmount } = render(
      await HelpArticlePage({ params: Promise.resolve({ slug: "payments" }) }),
    );
    expect(screen.getByText("Was this helpful?")).toBeInTheDocument();
    unmount();
    loadVote.mockResolvedValueOnce({ available: false });
    render(
      await HelpArticlePage({ params: Promise.resolve({ slug: "payments" }) }),
    );
    expect(screen.queryByText("Was this helpful?")).not.toBeInTheDocument();
  });

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
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute(
      "href",
      "/dashboard/help",
    );
  });

  it("renders previous and next links in sidebar order, and the TOC", async () => {
    const sequence = orderedArticles();
    const middle = sequence[1];
    render(
      await HelpArticlePage({
        params: Promise.resolve({ slug: middle.slug }),
      }),
    );
    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute(
      "href",
      `/dashboard/help/${sequence[0].slug}`,
    );
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute(
      "href",
      `/dashboard/help/${sequence[2].slug}`,
    );
    expect(
      screen.getByRole("navigation", { name: "On this page", hidden: true }),
    ).toBeInTheDocument();
  });

  it("links each TOC entry to a heading id", async () => {
    render(
      await HelpArticlePage({
        params: Promise.resolve({ slug: "troubleshooting" }),
      }),
    );
    const toc = screen.getByRole("navigation", {
      name: "On this page",
      hidden: true,
    });
    const links = within(toc).getAllByRole("link", { hidden: true });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const id = link.getAttribute("href")?.slice(1) ?? "";
      expect(document.getElementById(id)).not.toBeNull();
    }
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
