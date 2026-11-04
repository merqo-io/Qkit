import { describe, expect, it } from "vitest";
import {
  SCENES,
  findScene,
  formatSceneList,
  hasEmDash,
  parseArgs,
  resolveScene,
  sceneCaptionTexts,
  wrapCaption,
} from "../scripts/demo/scenes.mjs";
import {
  SPLIT,
  buildAudioGraph,
  buildVideoGraph,
  captionItems,
  ffEscapePath,
  panelSize,
  panelX,
} from "../scripts/demo/filters.mjs";
import { assertLoopback, localDemoDbUrl } from "../scripts/demo/base-url.mjs";

describe("demo scene registry", () => {
  it("has unique names and the thirteen episodes plus the tour", () => {
    const names = SCENES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("tour");
    const episodes = SCENES.map((s) => s.episode).filter((e) => e !== null);
    expect(episodes.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 13 }, (_, i) => i + 1),
    );
  });

  it("uses split mode for episodes 1, 3, 4, 7 and 12", () => {
    const split = SCENES.filter((s) => s.mode === "split").map(
      (s) => s.episode,
    );
    expect(split).toEqual([1, 3, 4, 7, 12]);
  });

  it.each(SCENES.map((s) => [s.name, s] as const))(
    "%s has no em dash in any caption",
    (_name, scene) => {
      for (const text of sceneCaptionTexts(scene)) {
        expect(hasEmDash(text), text).toBe(false);
      }
    },
  );

  it("detects an em dash", () => {
    expect(hasEmDash("a \u2014 b")).toBe(true);
    expect(hasEmDash("a - b")).toBe(false);
  });

  it("keeps stats on the free plan", () => {
    expect(findScene("stats")?.pro).toBeUndefined();
  });
});

describe("demo CLI arguments", () => {
  it("defaults to the tour", () => {
    expect(parseArgs([]).scene).toBe("tour");
  });

  it("reads --scene in both forms", () => {
    expect(parseArgs(["--scene", "status"]).scene).toBe("status");
    expect(parseArgs(["--scene=batch"]).scene).toBe("batch");
  });

  it("flags --list and bad input", () => {
    expect(parseArgs(["--list"]).list).toBe(true);
    expect(parseArgs(["--scene"]).error).toMatch(/needs a name/);
    expect(parseArgs(["--nope"]).error).toMatch(/Unknown argument/);
  });

  it("rejects an unknown scene with the list of scenes", () => {
    const err = resolveScene("nope");
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain(formatSceneList());
    expect(resolveScene("walk-up")).toMatchObject({ name: "walk-up" });
  });
});

describe("caption wrapping", () => {
  it("wraps at the limit and keeps long words whole", () => {
    expect(wrapCaption("Your customers order. You just make.", 24)).toEqual([
      "Your customers order.",
      "You just make.",
    ]);
    expect(wrapCaption("Grab takes 30%. We take 0.", 22)).toEqual([
      "Grab takes 30%.",
      "We take 0.",
    ]);
    expect(wrapCaption("supercalifragilistic", 5)).toEqual([
      "supercalifragilistic",
    ]);
  });
});

describe("compose filtergraph", () => {
  const meta = {
    hook: "Grab takes 30%. We take 0.",
    steps: [
      { caption: 'Customer pays: it\'s "done"', startMs: 1000, endMs: 3000 },
    ],
  };
  const viewport = { width: 390, height: 844 };

  it("refuses a path with a single quote", () => {
    expect(() => ffEscapePath("C:\\Users\\O'Neil\\f.ttf")).toThrow(
      /single quote/,
    );
  });

  it("escapes Windows paths for filter options", () => {
    expect(ffEscapePath("C:\\a b\\f.txt")).toBe("C\\:/a b/f.txt");
  });

  it("lays two panels inside the 1080px canvas", () => {
    const outer = SPLIT.panelW + SPLIT.border * 2;
    expect(panelX(1) + outer + SPLIT.margin).toBe(1080);
    expect(panelSize(viewport)).toEqual({ w: 500, h: 1082 });
  });

  it("clears a caption before the next one starts", () => {
    const items = captionItems(meta, 10);
    const step = items.find((i) => i.text.startsWith("Customer"));
    expect(step?.end).toBeLessThan(3);
    expect(items.some((i) => i.start === 0 && i.end === 10)).toBe(true);
  });

  it("builds a split graph that offsets the late recording", () => {
    const items = captionItems(meta, 10);
    const graph = buildVideoGraph({
      mode: "split",
      videos: [
        { role: "customer", startMs: 0, viewport },
        { role: "vendor", startMs: 2500, viewport },
      ],
      items,
      textPaths: items.map((_, i) => `/tmp/c${i}.txt`),
      fontPath: "/f.ttf",
      durS: 10,
      outroS: 2.8,
    }).join(";");
    expect(graph).toContain("[0:v]");
    expect(graph).toContain("[1:v]");
    expect(graph).toContain("tpad=start_duration=2.50");
    expect(graph).toContain(`overlay=x=${panelX(0)}:y=${SPLIT.top}`);
    expect(graph).toContain(`overlay=x=${panelX(1)}:y=${SPLIT.top}`);
    expect(graph).toContain("s=1080x1920");
    expect(graph).toContain("[v]");
  });

  it("places the chime at the pop time", () => {
    const graph = buildAudioGraph({ popSec: 4, totalS: 12 }).join(";");
    expect(graph).toContain("adelay=4000|4000");
    expect(graph).toContain("[a]");
  });
});

describe("demo database guard", () => {
  it("accepts a loopback Postgres only", () => {
    expect(
      localDemoDbUrl("postgresql://postgres:x@127.0.0.1:54322/postgres"),
    ).toBeTruthy();
    expect(() =>
      localDemoDbUrl("postgresql://u:p@db.example.com/postgres"),
    ).toThrow();
    expect(() => localDemoDbUrl("http://localhost:3000")).toThrow();
    expect(() => localDemoDbUrl(undefined)).toThrow();
  });

  it.each([
    "postgresql://u:p@localhost/postgres?host=db.example.com",
    "postgresql://u:p@localhost/postgres?hostaddr=203.0.113.5",
    "postgresql://u:p@localhost/postgres?service=prod",
    "postgresql://u:p@/postgres?host=db.example.com",
    "postgresql:///postgres",
  ])("rejects a redirecting or hostless url %s", (url) => {
    expect(() => localDemoDbUrl(url)).toThrow();
  });
});

describe("page host guard", () => {
  it("allows loopback pages and rejects others", () => {
    expect(assertLoopback("http://127.0.0.1:4319/pay/tx?k=mock")).toBe(
      "http://127.0.0.1:4319",
    );
    expect(assertLoopback("http://localhost:3000/x")).toBe(
      "http://localhost:3000",
    );
    expect(() => assertLoopback("https://pay.example.com/pay/1")).toThrow(
      /loopback/,
    );
  });
});
