// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const { auth, push, refresh, toast } = vi.hoisted(() => ({
  auth: { getUser: vi.fn(), updateUser: vi.fn() },
  push: vi.fn(),
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
const client = { auth };
vi.mock("@/lib/supabase/client", () => ({ createClient: () => client }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("sonner", () => ({ toast }));
import { ResetPasswordForm } from "./reset-password-form";

beforeEach(() => {
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: { id: "recovering-user" } } });
  auth.updateUser.mockResolvedValue({ error: null });
});

async function enterPasswords(
  password = "new-password-123",
  confirm = password,
) {
  fireEvent.change(await screen.findByLabelText("New password"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
}

describe("password recovery", () => {
  it("does not expose the password form before session validation", async () => {
    let resolve!: (value: { data: { user: null } }) => void;
    auth.getUser.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<ResetPasswordForm />);
    expect(screen.getByText(/checking your reset link/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    await act(async () => resolve({ data: { user: null } }));
    expect(
      screen.getByRole("heading", { name: "This link has expired" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/login");
  });

  it("rejects mismatched passwords before the auth API", async () => {
    render(<ResetPasswordForm />);
    await enterPasswords("long-password", "different-password");
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(screen.getByText(/passwords.*match/i)).toBeInTheDocument();
  });

  it("shows update errors and permits a retry without redirecting", async () => {
    auth.updateUser.mockResolvedValue({
      error: { message: "Recovery session expired" },
    });
    render(<ResetPasswordForm />);
    await enterPasswords();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Recovery session expired"),
    );
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Update password" }),
    ).toBeEnabled();
  });

  it("shows specific weak-password feedback and the requirements hint", async () => {
    auth.updateUser.mockResolvedValue({
      error: {
        code: "weak_password",
        reasons: ["length"],
        message: "Password should be at least 8 characters.",
      },
    });
    render(<ResetPasswordForm />);
    expect(
      await screen.findByRole("button", { name: "Password requirements" }),
    ).toBeInTheDocument();
    await enterPasswords();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Password is too short. Use at least 8 characters.",
      ),
    );
  });

  it("updates the authenticated password before routing to the dashboard", async () => {
    render(<ResetPasswordForm />);
    await enterPasswords();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: "new-password-123",
    });
    expect(toast.success).toHaveBeenCalledWith("Password updated");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows a recoverable error if session validation rejects", async () => {
    auth.getUser.mockRejectedValue(new Error("Network unavailable"));
    render(<ResetPasswordForm />);
    expect(
      await screen.findByText(/could not check your reset link/i),
    ).toBeInTheDocument();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/login");
  });
});
