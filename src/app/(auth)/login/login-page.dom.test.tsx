// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
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
});
