// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import ErrorPage from "./error";
import GlobalError from "./global-error";
import NotFound from "./not-found";
import AdminNotFound from "./admin/not-found";
import DashboardNotFound from "./dashboard/not-found";

describe("error recovery", () => {
  it("offers a retry without exposing server exception contents", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(
      <ErrorPage error={new Error("private server detail")} reset={reset} />,
    );
    expect(screen.queryByText("private server detail")).not.toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "That didn't load" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A hiccup on our end, usually a flaky connection. Try again.",
      ),
    ).toBeInTheDocument();
    await user.pointer({
      keys: "[TouchA]",
      target: screen.getByRole("button", { name: "Try again" }),
    });
    expect(reset).toHaveBeenCalledTimes(1);
  });
  it("shows Next's digest as a reference line", () => {
    const error = Object.assign(new Error("x"), { digest: "abc123" });
    render(<ErrorPage error={error} reset={vi.fn()} />);
    expect(screen.getByText("Reference: abc123")).toBeInTheDocument();
  });
  it("renders the root 404 copy and link", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This page or order doesn't exist. Scan the booth's QR code again to start a fresh order.",
      ),
    ).toBeInTheDocument();
  });
  it("supports recovery even when the root layout failed", async () => {
    const reset = vi.fn();
    const html = renderToStaticMarkup(
      <GlobalError error={new Error("private detail")} reset={reset} />,
    );
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<main");
    expect(html).toContain("<h1");
    expect(html).toContain("Something went wrong");
    expect(html).toContain(
      "An unexpected error interrupted the page. Please try again, and if it keeps happening, refresh in a moment.",
    );
    expect(html).not.toContain("private detail");

    const user = userEvent.setup();
    const view = render(
      <GlobalError error={new Error("private detail")} reset={reset} />,
      { container: document.documentElement },
    );
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    await user.pointer({
      keys: "[TouchA]",
      target: screen.getByRole("button", { name: "Try again" }),
    });
    expect(reset).toHaveBeenCalledTimes(1);
    view.unmount();
  });
  it.each([
    { Page: NotFound, target: "/", label: "Back to start" },
    { Page: AdminNotFound, target: "/admin", label: "Back to admin" },
    {
      Page: DashboardNotFound,
      target: "/dashboard",
      label: "Back to dashboard",
    },
  ])("routes missing-page recovery to $target", ({ Page, target, label }) => {
    render(<Page />);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      target,
    );
  });
});
