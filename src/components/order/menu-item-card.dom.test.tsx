// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MenuItemCard } from "./menu-item-card";
import type { MenuItem } from "@/lib/types";

vi.mock("@/components/widgets/zoomable-image", () => ({
  ZoomableImage: ({ alt }: { alt: string }) => (
    <div role="img" aria-label={alt} />
  ),
}));

function renderCard(item: Partial<MenuItem>) {
  return render(
    <MenuItemCard
      item={{ id: "1", name: "Teh", price_cents: 200, ...item } as MenuItem}
      plainQuantity={undefined}
      configuredInCart={0}
      left={null}
      held={false}
      closed={false}
      onAdd={() => {}}
      onIncrement={() => {}}
      onDecrement={() => {}}
    />,
  );
}

describe("MenuItemCard", () => {
  it("renders no image when the item has no photo", () => {
    renderCard({});
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Teh")).toBeInTheDocument();
  });

  it("renders the photo when the item has one", () => {
    renderCard({ image_url: "https://example.com/teh.webp" });
    expect(screen.getByRole("img", { name: "Teh" })).toBeInTheDocument();
  });

  it("offers Add when option_groups is empty", () => {
    renderCard({ option_groups: [] });
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("offers Add when every option group has no choices", () => {
    renderCard({ option_groups: [{ id: "g", label: "Ice", choices: [] }] });
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Customize" }),
    ).not.toBeInTheDocument();
  });

  it("offers Customize when a group has choices", () => {
    renderCard({
      option_groups: [
        { id: "g", label: "Ice", choices: [{ id: "c", label: "Less ice" }] },
      ],
    });
    expect(
      screen.getByRole("button", { name: "Customize" }),
    ).toBeInTheDocument();
  });
});
