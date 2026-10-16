// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SelectionBar } from "./board-batch";

vi.mock("./order-actions", () => ({
  advanceOrder: vi.fn(),
  revertOrderAdvance: vi.fn(),
}));

// The replay button belongs to @merqo/ui's DashboardTours; this stand-in
// carries the same data-tour hook its own tests pin down.
function ReplayButton() {
  return (
    <button type="button" data-tour="tour-replay">
      ?
    </button>
  );
}

const noop = () => {};

function Bar() {
  return (
    <SelectionBar
      readyCount={1}
      pickupCount={0}
      allSelected={false}
      busy={false}
      onCancel={noop}
      onToggleAll={noop}
      onMarkReady={noop}
      onMarkPickedUp={noop}
    />
  );
}

beforeAll(() => {
  // Only the one rule: jsdom can't parse the Tailwind directives in the rest.
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const rule = css.match(/body:has\(\[data-selection-bar\]\)[^}]*\}/);
  if (!rule) throw new Error("tour-replay hide rule missing from globals.css");
  const style = document.createElement("style");
  style.textContent = rule[0];
  document.head.appendChild(style);
});

afterEach(cleanup);

const replay = () =>
  document.querySelector<HTMLElement>('[data-tour="tour-replay"]')!;

describe("tour replay button vs the selection bar", () => {
  it("shows the replay button when no selection bar is open", () => {
    render(<ReplayButton />);
    expect(getComputedStyle(replay()).display).not.toBe("none");
  });

  it("hides the replay button while the selection bar is open", () => {
    render(
      <>
        <ReplayButton />
        <Bar />
      </>,
    );
    expect(
      screen.getByRole("toolbar", { name: "Selected orders" }),
    ).toBeInTheDocument();
    expect(getComputedStyle(replay()).display).toBe("none");
  });

  it("brings the replay button back once the bar closes", () => {
    const { rerender } = render(
      <>
        <ReplayButton />
        <Bar />
      </>,
    );
    rerender(<ReplayButton />);
    expect(getComputedStyle(replay()).display).not.toBe("none");
  });
});
