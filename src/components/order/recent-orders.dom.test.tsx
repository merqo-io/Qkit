// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { RecentOrder } from "@/lib/recent-orders";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/recent-orders", () => ({ getRecentOrdersForBooth: read }));
import { RecentOrders } from "./recent-orders";
const orders: RecentOrder[] = Array.from({ length: 5 }, (_, index) => ({
  boothId: "booth-a",
  orderNumber: String(index + 1).padStart(4, "0"),
  customerName: `Customer ${index}`,
  token: index === 0 ? "access-token" : undefined,
  placedAt: Date.now(),
}));

beforeEach(() => read.mockReset().mockReturnValue(orders));

describe("recent customer orders", () => {
  it("renders nothing without locally remembered orders", () => {
    read.mockReturnValue([]);
    const { container } = render(<RecentOrders boothId="unknown" />);
    expect(container).toBeEmptyDOMElement();
    expect(read).toHaveBeenCalledWith("unknown");
  });
  it("collapses long histories while retaining authenticated tracking links", () => {
    render(<RecentOrders boothId="booth-a" />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /#0001/ })).toHaveAttribute(
      "href",
      "/order/booth-a/0001?t=access-token",
    );
    expect(screen.getByRole("link", { name: /#0002/ })).toHaveAttribute(
      "href",
      "/order/booth-a/0002",
    );
    fireEvent.click(screen.getByRole("button", { name: "Show all (5)" }));
    expect(screen.getAllByRole("link")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
  it("names an order by the number its status page showed", () => {
    read.mockReturnValue([{ ...orders[0], displayNumber: "3" }]);
    render(<RecentOrders boothId="booth-a" />);
    expect(
      screen.getByRole("link", { name: /#3 for Customer 0/ }),
    ).toHaveAttribute("href", "/order/booth-a/0001?t=access-token");
  });
  it("reloads history for a new booth and omits the toggle for short histories", () => {
    const { rerender } = render(<RecentOrders boothId="booth-a" />);
    read.mockReturnValue([orders[0]]);
    rerender(<RecentOrders boothId="booth-b" />);
    expect(read).toHaveBeenLastCalledWith("booth-b");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
