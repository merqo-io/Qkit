import { describe, expect, it } from "vitest";

import { pinFits, pinnedProgress } from "./pinned-progress";
import { progressToStep } from "./use-scroll-play";

const base = { trackHeight: 1000, panelHeight: 400, pinTop: 80 };

describe("pinnedProgress", () => {
  it("is 0 before the track reaches the pin point", () => {
    expect(pinnedProgress({ ...base, trackTop: 500 })).toBe(0);
    expect(pinnedProgress({ ...base, trackTop: 80 })).toBe(0);
  });

  it("rises linearly while pinned", () => {
    expect(pinnedProgress({ ...base, trackTop: -220 })).toBeCloseTo(0.5);
  });

  it("is 1 once the panel is released and stays 1 after", () => {
    expect(pinnedProgress({ ...base, trackTop: -520 })).toBe(1);
    expect(pinnedProgress({ ...base, trackTop: -5000 })).toBe(1);
  });

  it("reads as finished when there is no scroll distance", () => {
    expect(pinnedProgress({ ...base, trackHeight: 400, trackTop: 80 })).toBe(1);
    expect(pinnedProgress({ ...base, trackHeight: 300, trackTop: 80 })).toBe(1);
    expect(
      pinnedProgress({
        trackHeight: 0,
        panelHeight: 0,
        pinTop: 0,
        trackTop: 0,
      }),
    ).toBe(1);
  });

  it("supports a negative pin point for panels taller than the viewport", () => {
    expect(
      pinnedProgress({ ...base, pinTop: -60, trackTop: -60 - 300 }),
    ).toBeCloseTo(0.5);
  });

  it("maps to steps 0..4 in equal bands and holds the last", () => {
    const at = (p: number) => progressToStep(p, 4);
    expect(at(0)).toBe(0);
    expect(at(0.19)).toBe(0);
    expect(at(0.2)).toBe(1);
    expect(at(0.4)).toBe(2);
    expect(at(0.6)).toBe(3);
    expect(at(0.8)).toBe(4);
    expect(at(1)).toBe(4);
  });
});

describe("pinFits", () => {
  it("fits when the panel ends at or above the viewport bottom", () => {
    expect(pinFits({ panelHeight: 584, viewportHeight: 664, pinTop: 80 })).toBe(
      true,
    );
    expect(pinFits({ panelHeight: 640, viewportHeight: 755, pinTop: 80 })).toBe(
      true,
    );
  });

  it("does not fit when any of the panel would run below the fold", () => {
    expect(pinFits({ panelHeight: 585, viewportHeight: 664, pinTop: 80 })).toBe(
      false,
    );
    expect(pinFits({ panelHeight: 448, viewportHeight: 520, pinTop: 80 })).toBe(
      false,
    );
  });

  it("treats an unmeasured panel or viewport as fitting", () => {
    expect(pinFits({ panelHeight: 0, viewportHeight: 664, pinTop: 80 })).toBe(
      true,
    );
    expect(pinFits({ panelHeight: 500, viewportHeight: 0, pinTop: 80 })).toBe(
      true,
    );
  });
});
