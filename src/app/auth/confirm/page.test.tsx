// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { client } = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: client }));
vi.mock("@/lib/supabase/client", () => ({ createClient: client }));
import AuthConfirmPage from "./page";

async function renderPage(params: Record<string, string>) {
  const ui = await AuthConfirmPage({ searchParams: Promise.resolve(params) });
  return render(ui);
}

describe("auth confirm page", () => {
  it("renders the continue form for a valid link without touching Supabase", async () => {
    const { container } = await renderPage({
      token_hash: "abc123",
      type: "recovery",
    });
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/auth/confirm/verify");
    expect(container.querySelector('input[name="token_hash"]')).toHaveAttribute(
      "value",
      "abc123",
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(client).not.toHaveBeenCalled();
  });

  it("renders the invalid state when the link is missing its token", async () => {
    const { container } = await renderPage({ type: "recovery" });
    expect(container.querySelector("form")).toBeNull();
    expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(client).not.toHaveBeenCalled();
  });

  it("emits no inline event handlers, styles or scripts the CSP would block", async () => {
    const { container } = await renderPage({
      token_hash: "abc123",
      type: "recovery",
    });
    expect(container.querySelector("script, [style]")).toBeNull();
    const handlers = [...container.querySelectorAll("*")].flatMap((el) =>
      el.getAttributeNames().filter((name) => name.startsWith("on")),
    );
    expect(handlers).toEqual([]);
  });
});
