// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloseBoothControl } from "./close-booth-control";

const { toggleBoothActive } = vi.hoisted(() => ({
  toggleBoothActive: vi.fn(),
}));
vi.mock("./actions", () => ({ toggleBoothActive }));

const { toastFn, toastError } = vi.hoisted(() => ({
  toastFn: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: Object.assign((...args: unknown[]) => toastFn(...args), {
    error: toastError,
    success: vi.fn(),
  }),
}));

const BOOTH_ID = "b1";

beforeEach(() => {
  vi.clearAllMocks();
  toggleBoothActive.mockResolvedValue({ success: true });
});

describe("CloseBoothControl (active)", () => {
  it("shows Open status and opens a hold-to-close dialog", async () => {
    const user = userEvent.setup();
    render(
      <CloseBoothControl
        boothId={BOOTH_ID}
        boothName="Kopi Corner"
        isActive={true}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText("Open")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /pause booth/i }));
    expect(
      screen.getByRole("button", { name: /hold for 3 seconds/i }),
    ).toBeInTheDocument();
    expect(toggleBoothActive).not.toHaveBeenCalled();
  });

  it("does not close on a quick tap released before the hold completes", async () => {
    render(
      <CloseBoothControl
        boothId={BOOTH_ID}
        boothName="Kopi Corner"
        isActive={true}
        onChanged={vi.fn()}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /pause booth/i }));
    const hold = screen.getByRole("button", {
      name: /hold for 3 seconds/i,
    });

    fireEvent.pointerDown(hold);
    fireEvent.pointerUp(hold);

    await new Promise((r) => setTimeout(r, 50));
    expect(toggleBoothActive).not.toHaveBeenCalled();
  });

  it("closes after a full 3-second hold, undoes via the toast action, and reports both", async () => {
    const onChanged = vi.fn();
    render(
      <CloseBoothControl
        boothId={BOOTH_ID}
        boothName="Kopi Corner"
        isActive={true}
        onChanged={onChanged}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /pause booth/i }));
    const hold = screen.getByRole("button", {
      name: /hold for 3 seconds/i,
    });

    fireEvent.pointerDown(hold);

    await waitFor(
      () => expect(toggleBoothActive).toHaveBeenCalledWith(BOOTH_ID, false),
      { timeout: 4000 },
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(false));

    expect(toastFn).toHaveBeenCalledWith(
      "Kopi Corner is paused",
      expect.objectContaining({
        duration: 60_000,
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );

    // Invoke the toast's own Undo action directly (sonner doesn't render
    // its portal in this component-only test) and confirm it reopens.
    const [, opts] = toastFn.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    opts.action.onClick();
    await waitFor(() =>
      expect(toggleBoothActive).toHaveBeenCalledWith(BOOTH_ID, true),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(true));
  }, 6000);

  it("shows an error toast and leaves state alone when closing fails", async () => {
    toggleBoothActive.mockResolvedValue({
      success: false,
      error: "Could not update booth",
    });
    const onChanged = vi.fn();
    render(
      <CloseBoothControl
        boothId={BOOTH_ID}
        boothName="Kopi Corner"
        isActive={true}
        onChanged={onChanged}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /pause booth/i }));
    fireEvent.pointerDown(
      screen.getByRole("button", { name: /hold for 3 seconds/i }),
    );

    await waitFor(() => expect(toggleBoothActive).toHaveBeenCalled(), {
      timeout: 4000,
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Could not update booth");
  }, 6000);
});

describe("CloseBoothControl (paused)", () => {
  it("shows Paused status and resumes instantly, no hold required", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      <CloseBoothControl
        boothId={BOOTH_ID}
        boothName="Kopi Corner"
        isActive={false}
        onChanged={onChanged}
      />,
    );
    expect(screen.getByText("Paused")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /resume booth/i }));

    expect(toggleBoothActive).toHaveBeenCalledWith(BOOTH_ID, true);
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(true));
  });

  it("shows an error toast and leaves state alone when reopening fails", async () => {
    toggleBoothActive.mockResolvedValue({
      success: false,
      error: "Could not update booth",
    });
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      <CloseBoothControl
        boothId={BOOTH_ID}
        boothName="Kopi Corner"
        isActive={false}
        onChanged={onChanged}
      />,
    );
    await user.click(screen.getByRole("button", { name: /resume booth/i }));

    await waitFor(() => expect(toggleBoothActive).toHaveBeenCalled());
    expect(onChanged).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("Could not update booth");
  });
});
