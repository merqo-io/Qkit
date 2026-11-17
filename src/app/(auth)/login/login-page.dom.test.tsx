// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authMock, search } = vi.hoisted(() => ({
  search: { value: "" },
  authMock: {
    signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: authMock }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import LoginPage from "./page";

describe("LoginPage", () => {
  it("shows the expired-link message only for ?error=link", () => {
    search.value = "error=link";
    const { unmount } = render(<LoginPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That link is invalid or has expired. Request a new one.",
    );
    unmount();
    search.value = "";
    render(<LoginPage />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the wordmark, Google button, and email/password form", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "qkit home" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue with Google/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("forces English locale on the Google OAuth consent screen", async () => {
    render(<LoginPage />);
    fireEvent.click(
      screen.getByRole("button", { name: /Continue with Google/ }),
    );
    await waitFor(() =>
      expect(authMock.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { hl: "en" },
        },
      }),
    );
  });

  it("shows the requirements hint in signup mode only", () => {
    search.value = "";
    const { unmount } = render(<LoginPage />);
    expect(
      screen.queryByRole("button", { name: "Password requirements" }),
    ).toBeNull();
    unmount();
    search.value = "mode=signup";
    render(<LoginPage />);
    expect(
      screen.getByRole("button", { name: "Password requirements" }),
    ).toBeInTheDocument();
  });

  it("shows specific feedback when signup returns a weak_password error", async () => {
    search.value = "mode=signup";
    authMock.signUp.mockResolvedValue({
      data: {},
      error: {
        code: "weak_password",
        reasons: ["pwned"],
        message: "Password is known to be weak.",
      },
    });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Password1!" },
    });
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This password has appeared in a data breach. Choose a different one.",
      ),
    );
  });

  it("gives the mode toggle a 44px touch target and a focus ring", async () => {
    search.value = "";
    render(<LoginPage />);
    const toggle = screen.getByRole("button", { name: "Create an account" });
    expect(toggle).toHaveClass("min-h-11", "inline-flex", "items-center");
    expect(toggle).toHaveClass("focus-visible:ring-[3px]");
    const user = userEvent.setup();
    await user.pointer({ keys: "[TouchA]", target: toggle });
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
