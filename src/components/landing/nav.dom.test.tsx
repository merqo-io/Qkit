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
});
