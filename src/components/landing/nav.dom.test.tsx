// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Nav } from "./nav";

const VISIBILITY = new Set(["hidden", "inline-flex", "sm:inline-flex"]);

function styleTokens(el: HTMLElement) {
  return el.className
    .split(/\s+/)
    .filter((token) => token && !VISIBILITY.has(token))
    .sort();
}

describe("landing Nav", () => {
  const signOut = vi.fn(async () => {});

  it("signed out shows Sign in and Get started and no account menu", () => {
    render(<Nav user={null} signOutAction={signOut} />);
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get started" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /account menu/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Dashboard" }),
    ).not.toBeInTheDocument();
  });

  it("signed in shows Dashboard and an account menu whose sign out runs the action", async () => {
    const user = userEvent.setup();
    render(<Nav user={{ name: "Kopi Corner" }} signOutAction={signOut} />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(
      screen.queryByRole("link", { name: "Sign in" }),
    ).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /account menu/i });
    await user.pointer({ keys: "[TouchA]", target: trigger });
    const signOutItem = await screen.findByRole("menuitem", {
      name: /sign out/i,
    });
    expect(signOutItem).toBeVisible();
    await user.pointer({ keys: "[TouchA]", target: signOutItem });
    expect(signOut).toHaveBeenCalled();
  });

  it("FAQ and About links share the same styling classes", () => {
    render(<Nav user={{ name: "Kopi Corner" }} signOutAction={signOut} />);
    const faq = styleTokens(screen.getByRole("link", { name: "FAQ" }));
    const about = styleTokens(screen.getByRole("link", { name: "About" }));
    expect(faq.length).toBeGreaterThan(0);
    expect(faq).toEqual(about);
  });

  it("gives every visible control a 44px hit area below sm and 32px from sm up", () => {
    const { unmount } = render(
      <Nav user={{ name: "Kopi Corner" }} signOutAction={signOut} />,
    );
    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard.className).toContain("min-h-11");
    expect(dashboard.className).toContain("sm:min-h-0");
    unmount();

    render(<Nav user={null} signOutAction={signOut} />);
    for (const name of ["Sign in", "Get started"]) {
      const cls = screen.getByRole("link", { name }).className;
      expect(cls).toContain("h-11");
      expect(cls).toContain("sm:h-8");
    }
  });
});
