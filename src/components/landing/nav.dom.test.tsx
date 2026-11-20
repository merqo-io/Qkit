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
    render(<Nav account={null} signOutAction={signOut} />);
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
    render(
      <Nav
        account={{ name: "Kopi Corner", avatarUrl: null }}
        signOutAction={signOut}
      />,
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(
      screen.queryByRole("link", { name: "Sign in" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });

  it("FAQ, About and Dashboard links share the same styling classes", () => {
    render(
      <Nav
        account={{ name: "Kopi Corner", avatarUrl: null }}
        signOutAction={signOut}
      />,
    );
    const faq = styleTokens(screen.getByRole("link", { name: "FAQ" }));
    const about = styleTokens(screen.getByRole("link", { name: "About" }));
    const dash = styleTokens(screen.getByRole("link", { name: "Dashboard" }));
    expect(faq.length).toBeGreaterThan(0);
    expect(faq).toEqual(about);
    expect(dash).toEqual(about);
  });

  it("gives every visible control a 44px hit area below sm and 32px from sm up", () => {
    const { unmount } = render(
      <Nav
        account={{ name: "Kopi Corner", avatarUrl: null }}
        signOutAction={signOut}
      />,
    );
    for (const name of ["FAQ", "About", "Dashboard"]) {
      const cls = screen.getByRole("link", { name }).className;
      expect(cls).toContain("h-11");
      expect(cls).toContain("min-w-11");
      expect(cls).toContain("sm:h-8");
    }
    const wrapper = screen.getByRole("button", { name: /account menu/i })
      .parentElement as HTMLElement;
    expect(wrapper.className).toContain("[&_button]:min-h-11");
    expect(wrapper.className).toContain("[&_button]:min-w-11");
    expect(wrapper.className).toContain("sm:[&_button]:min-h-0");
    unmount();

    render(<Nav account={null} signOutAction={signOut} />);
    for (const name of ["Sign in", "Get started"]) {
      const cls = screen.getByRole("link", { name }).className;
      expect(cls).toContain("h-11");
      expect(cls).toContain("sm:h-8");
    }
  });
});
