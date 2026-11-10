// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  unenroll: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      mfa: {
        enroll: mocks.enroll,
        challengeAndVerify: mocks.challengeAndVerify,
        unenroll: mocks.unenroll,
      },
    },
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
import { MfaForm } from "./mfa-form";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.challengeAndVerify.mockResolvedValue({ error: null });
  mocks.enroll.mockResolvedValue({
    data: {
      id: "new-factor",
      totp: { qr_code: "data:image/svg+xml;utf8,<svg/>", secret: "JBSWY3DP" },
    },
    error: null,
  });
  mocks.unenroll.mockResolvedValue({ error: null });
});

it("verifies an enrolled factor and enters the console", async () => {
  const user = userEvent.setup();
  render(<MfaForm verifiedFactorId="f1" staleFactorIds={[]} />);
  await user.type(screen.getByLabelText("6-digit code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify" }));
  expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
    factorId: "f1",
    code: "123456",
  });
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"));
});

it("shows a wrong-code error and stays on the page", async () => {
  mocks.challengeAndVerify.mockResolvedValue({ error: { message: "bad" } });
  const user = userEvent.setup();
  render(<MfaForm verifiedFactorId="f1" staleFactorIds={[]} />);
  await user.type(screen.getByLabelText("6-digit code"), "000000");
  await user.click(screen.getByRole("button", { name: "Verify" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "That code did not work",
  );
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("enrols a new factor, shows its QR and secret, then verifies it", async () => {
  const user = userEvent.setup();
  render(<MfaForm verifiedFactorId={null} staleFactorIds={["old"]} />);
  await user.click(
    screen.getByRole("button", { name: "Set up authenticator" }),
  );
  expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: "old" });
  expect(await screen.findByText("JBSWY3DP")).toBeInTheDocument();
  expect(screen.getByAltText("Authenticator QR code")).toBeInTheDocument();
  await user.type(screen.getByLabelText("6-digit code"), "654321");
  await user.click(screen.getByRole("button", { name: "Verify" }));
  expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
    factorId: "new-factor",
    code: "654321",
  });
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"));
});

it("rejects a non-numeric code before calling Supabase", async () => {
  const user = userEvent.setup();
  render(<MfaForm verifiedFactorId="f1" staleFactorIds={[]} />);
  await user.type(screen.getByLabelText("6-digit code"), "12ab");
  await user.click(screen.getByRole("button", { name: "Verify" }));
  expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
});

const WRONG =
  "That code did not work. Check the time on your phone and try again.";

it("uses numeric one-time-code input attributes", () => {
  render(<MfaForm verifiedFactorId="f1" staleFactorIds={[]} />);
  const input = screen.getByLabelText("6-digit code");
  expect(input).toHaveAttribute("inputmode", "numeric");
  expect(input).toHaveAttribute("autocomplete", "one-time-code");
});

it("verifies a pasted code with spaces as six digits", async () => {
  const user = userEvent.setup();
  render(<MfaForm verifiedFactorId="f1" staleFactorIds={[]} />);
  await user.click(screen.getByLabelText("6-digit code"));
  await user.paste("123 456");
  await user.click(screen.getByRole("button", { name: "Verify" }));
  expect(mocks.challengeAndVerify).toHaveBeenCalledWith({
    factorId: "f1",
    code: "123456",
  });
});

it("verifies by touch", async () => {
  const user = userEvent.setup();
  render(<MfaForm verifiedFactorId="f1" staleFactorIds={[]} />);
  await user.type(screen.getByLabelText("6-digit code"), "123456");
  await user.pointer({
    keys: "[TouchA]",
    target: screen.getByRole("button", { name: "Verify" }),
  });
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"));
  expect(mocks.refresh).toHaveBeenCalled();
});

it("shows the same copy for a rate-limited verify, listed code or not", async () => {
  const user = userEvent.setup();
  mocks.challengeAndVerify.mockResolvedValue({
    error: { code: "over_request_rate_limit", message: "Too many requests" },
  });
  const { unmount } = render(
    <MfaForm verifiedFactorId="f1" staleFactorIds={[]} />,
  );
  await user.type(screen.getByLabelText("6-digit code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(WRONG);
  unmount();

  mocks.challengeAndVerify.mockResolvedValue({
    error: { code: "some_unlisted_code", message: "rate limit exceeded" },
  });
  render(<MfaForm verifiedFactorId="f1" staleFactorIds={[]} />);
  await user.type(screen.getByLabelText("6-digit code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(WRONG);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("shows the setup copy when enrolment fails", async () => {
  mocks.enroll.mockResolvedValue({ data: null, error: { message: "nope" } });
  const user = userEvent.setup();
  render(<MfaForm verifiedFactorId={null} staleFactorIds={[]} />);
  await user.click(
    screen.getByRole("button", { name: "Set up authenticator" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not start setup. Try again.",
  );
});

it("shows the setup copy when enrolment throws", async () => {
  mocks.enroll.mockRejectedValue(new Error("network down"));
  const user = userEvent.setup();
  render(<MfaForm verifiedFactorId={null} staleFactorIds={["old"]} />);
  await user.click(
    screen.getByRole("button", { name: "Set up authenticator" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not start setup. Try again.",
  );
});

it("never navigates when verification throws", async () => {
  mocks.challengeAndVerify.mockRejectedValue(new Error("network down"));
  const user = userEvent.setup();
  render(<MfaForm verifiedFactorId="f1" staleFactorIds={[]} />);
  await user.type(screen.getByLabelText("6-digit code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(WRONG);
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
