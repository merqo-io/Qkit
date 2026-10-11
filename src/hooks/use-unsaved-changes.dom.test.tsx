// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useUnsavedChanges } from "./use-unsaved-changes";

function Form({ dirty, onLeave }: { dirty: boolean; onLeave: () => void }) {
  const confirmLeave = useUnsavedChanges(dirty);
  return (
    <div>
      <a href="/another-page">Booths</a>
      <a href="#section">Jump</a>
      <a href="https://example.com/">Elsewhere</a>
      <button type="button" onClick={() => confirmLeave() && onLeave()}>
        Cancel
      </button>
    </div>
  );
}

/** Click a link and report whether the click was allowed to go ahead. */
function clickAllowed(name: string): boolean {
  return fireEvent.click(screen.getByRole("link", { name }));
}

afterEach(() => vi.restoreAllMocks());

describe("useUnsavedChanges", () => {
  it("lets every click through while nothing has changed", () => {
    const confirm = vi.spyOn(window, "confirm");
    const onLeave = vi.fn();
    render(<Form dirty={false} onLeave={onLeave} />);

    expect(clickAllowed("Booths")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalled();
  });

  it("holds a link to another page when the vendor chooses to stay", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Form dirty onLeave={vi.fn()} />);
    expect(clickAllowed("Booths")).toBe(false);
  });

  it("follows the link when the vendor chooses to leave", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Form dirty onLeave={vi.fn()} />);
    expect(clickAllowed("Booths")).toBe(true);
  });

  it("does not ask about a jump within the page or a link off the site", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Form dirty onLeave={vi.fn()} />);

    expect(clickAllowed("Jump")).toBe(true);
    expect(clickAllowed("Elsewhere")).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks before a button that leaves in code", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onLeave = vi.fn();
    render(<Form dirty onLeave={onLeave} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onLeave).not.toHaveBeenCalled();
  });

  it("raises the browser's leave prompt on unload only while dirty", () => {
    const { rerender } = render(<Form dirty onLeave={vi.fn()} />);
    const dirtyUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);

    rerender(<Form dirty={false} onLeave={vi.fn()} />);
    const cleanUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
  });
});
