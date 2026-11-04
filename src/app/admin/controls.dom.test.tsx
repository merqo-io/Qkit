// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const { path, refresh, support, error } = vi.hoisted(() => ({
  path: { value: "/admin" },
  refresh: vi.fn(),
  support: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => path.value,
  useRouter: () => ({ refresh }),
}));
vi.mock("./actions", () => ({
  resolveSupportMessage: support,
}));
vi.mock("sonner", () => ({ toast: { error } }));
import { AdminNav } from "./admin-nav";
import { VendorList, type VendorListItem } from "./vendor-list";
import { ResolveMessageButton } from "./resolve-message-button";
beforeEach(() => {
  vi.clearAllMocks();
  path.value = "/admin";
  support.mockResolvedValue({ success: true });
});
describe("admin navigation and directory", () => {
  it.each([
    ["/admin", "Overview"],
    ["/admin/vendors/a", "Vendors"],
    ["/admin/feedback", "Feedback"],
  ])("highlights the current section %s", (pathname, label) => {
    path.value = pathname;
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: label })).toHaveClass(
      "text-primary",
    );
    for (const link of screen.getAllByRole("link"))
      if (link.textContent !== label)
        expect(link).not.toHaveClass("text-primary");
  });
  it("shows an empty state without vendor links", () => {
    render(<VendorList vendors={[]} />);
    expect(screen.getByText("No vendors yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("links to exact vendors and shows pass/status metadata", () => {
    const base: VendorListItem = {
      id: "a",
      name: "Coffee",
      tier: "qkit",
      created_at: "2026-10-01",
      passHoursLeft: 4,
      status: "attention",
      orders7d: 5,
      lastOrderAt: "2026-10-02",
      boothCount: 2,
    };
    render(
      <VendorList
        vendors={[
          base,
          {
            ...base,
            id: "b",
            name: "Tea",
            tier: "free",
            passHoursLeft: null,
            lastOrderAt: null,
            status: "new",
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /Coffee/ })).toHaveAttribute(
      "href",
      "/admin/vendors/a",
    );
    expect(screen.getByRole("link", { name: /Tea/ })).toHaveAttribute(
      "href",
      "/admin/vendors/b",
    );
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("4h")).toBeInTheDocument();
  });
});
describe.each([
  { label: "support", Button: ResolveMessageButton, action: support },
])("resolve $label", ({ Button, action }) => {
  it("refreshes only after successful resolution", async () => {
    render(<Button id="request-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith({ id: "request-a" });
  });
  it("shows failure without hiding the unresolved request", async () => {
    action.mockResolvedValue({ success: false, error: "Try again" });
    render(<Button id="request-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Try again"));
    expect(refresh).not.toHaveBeenCalled();
  });
  it("prevents duplicate clicks while the action is pending", async () => {
    let finish!: (result: { success: boolean }) => void;
    action.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<Button id="request-a" />);
    const button = screen.getByRole("button", { name: "Resolve" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    finish({ success: true });
    await waitFor(() => expect(button).toBeEnabled());
    expect(action).toHaveBeenCalledTimes(1);
  });
});
