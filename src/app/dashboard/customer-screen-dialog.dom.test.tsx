// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import {
  CustomerScreenButton,
  customerScreenUrl,
} from "./customer-screen-dialog";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("react-qr-code", () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="qr" data-value={value} />
  ),
}));

const KOPI = { id: "b-kopi", name: "Kopi Cart" };
const TEH = { id: "b-teh", name: "Teh Stand" };
const urlFor = (id: string) => customerScreenUrl(window.location.origin, id);

let open: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  open = vi.fn().mockReturnValue({});
  vi.stubGlobal("open", open);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Customer screen" }));
  await screen.findByRole("dialog");
  return user;
}

describe("customerScreenUrl", () => {
  it("points at the booth's public queue display", () => {
    expect(customerScreenUrl("https://qkit.example", "b1")).toBe(
      "https://qkit.example/order/b1/display",
    );
  });
});

describe("CustomerScreenButton", () => {
  it("renders nothing for a vendor with no booth", () => {
    const { container } = render(<CustomerScreenButton booths={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the screen in its own window, to drag onto a TV", async () => {
    render(<CustomerScreenButton booths={[KOPI]} />);
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "Open the screen" }));

    expect(open).toHaveBeenCalledWith(
      urlFor(KOPI.id),
      `qkit-screen-${KOPI.id}`,
      expect.stringContaining("popup"),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says so when the browser blocks the window", async () => {
    open.mockReturnValue(null);
    render(<CustomerScreenButton booths={[KOPI]} />);
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "Open the screen" }));

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("blocked the window"),
    );
  });

  it("offers a code to scan and a link to copy for another device", async () => {
    render(<CustomerScreenButton booths={[KOPI]} />);
    const user = await openDialog();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    expect(screen.getByTestId("qr")).toHaveAttribute(
      "data-value",
      urlFor(KOPI.id),
    );
    await user.pointer({
      keys: "[TouchA]",
      target: screen.getByRole("button", { name: "Copy the link" }),
    });
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(urlFor(KOPI.id)),
    );
    expect(toast.success).toHaveBeenCalledWith("Link copied");
  });

  it("has no booth picker for a single booth", async () => {
    render(<CustomerScreenButton booths={[KOPI]} />);
    await openDialog();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("starts on the booth the board is filtered to, and switches booth", async () => {
    render(
      <CustomerScreenButton booths={[KOPI, TEH]} defaultBoothId={TEH.id} />,
    );
    const user = await openDialog();

    expect(screen.getByRole("radio", { name: TEH.name })).toBeChecked();
    expect(screen.getByTestId("qr")).toHaveAttribute(
      "data-value",
      urlFor(TEH.id),
    );

    await user.click(screen.getByRole("radio", { name: KOPI.name }));
    expect(screen.getByTestId("qr")).toHaveAttribute(
      "data-value",
      urlFor(KOPI.id),
    );
  });

  it("falls back to the first booth when none is selected", async () => {
    render(<CustomerScreenButton booths={[KOPI, TEH]} />);
    await openDialog();
    expect(screen.getByRole("radio", { name: KOPI.name })).toBeChecked();
  });
});
