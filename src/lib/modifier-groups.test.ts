import { describe, expect, it } from "vitest";
import {
  expandLinkedGroups,
  hasDuplicateGroupLabels,
  linkGroup,
  promoteToLibrary,
  removeLibraryGroup,
  unlinkGroup,
  usageCount,
} from "./modifier-groups";
import type { OptionGroup } from "./types";

const sugar: OptionGroup = {
  id: "lib1",
  label: "Sugar",
  choices: [{ id: "a", label: "Normal" }],
};
const copy = (over: Partial<OptionGroup> = {}): OptionGroup => ({
  id: "g1",
  label: "Sugar",
  choices: [{ id: "old", label: "Old" }],
  shared_id: "lib1",
  ...over,
});

describe("expandLinkedGroups", () => {
  it("replaces a linked copy in place with the library content", () => {
    const [item] = expandLinkedGroups(
      [{ option_groups: [copy({ label: "Stale" })] }],
      [{ ...sugar, multiple: true }],
    );
    expect(item?.option_groups).toEqual([
      { ...sugar, multiple: true, id: "g1", shared_id: "lib1" },
    ]);
  });
  it("keeps position and unlinked groups untouched", () => {
    const solo: OptionGroup = {
      id: "s",
      label: "Solo",
      choices: sugar.choices,
    };
    const [item] = expandLinkedGroups(
      [{ option_groups: [solo, copy()] }],
      [sugar],
    );
    expect(item?.option_groups?.[0]).toBe(solo);
    expect(item?.option_groups?.[1]?.choices).toEqual(sugar.choices);
  });
  it("drops an unknown shared_id and keeps the copy", () => {
    const [item] = expandLinkedGroups([{ option_groups: [copy()] }], []);
    expect(item?.option_groups).toEqual([
      { id: "g1", label: "Sugar", choices: [{ id: "old", label: "Old" }] },
    ]);
  });
  it("returns items without links unchanged", () => {
    const plain: { option_groups?: OptionGroup[] } = {};
    expect(expandLinkedGroups([plain], [sugar])[0]).toBe(plain);
  });
});

describe("linkGroup", () => {
  it("appends a linked copy", () => {
    expect(linkGroup({}, [sugar], "lib1", "n1")).toEqual({
      ok: true,
      value: { option_groups: [{ ...sugar, id: "n1", shared_id: "lib1" }] },
    });
  });
  it("rejects a label the item already has, ignoring case", () => {
    const r = linkGroup(
      {
        option_groups: [{ id: "x", label: " sugar ", choices: sugar.choices }],
      },
      [sugar],
      "lib1",
      "n1",
    );
    expect(r.ok).toBe(false);
  });
  it("rejects an unknown library id", () => {
    expect(linkGroup({}, [sugar], "nope", "n1").ok).toBe(false);
  });
});

describe("unlinkGroup", () => {
  it("strips shared_id from the named group only", () => {
    const item = unlinkGroup(
      { option_groups: [copy(), copy({ id: "g2", label: "Ice" })] },
      "g1",
    );
    expect(item.option_groups?.[0]).not.toHaveProperty("shared_id");
    expect(item.option_groups?.[1]?.shared_id).toBe("lib1");
  });
  it("is a no-op without groups", () => {
    const item = {};
    expect(unlinkGroup(item, "g1")).toBe(item);
  });
});

describe("usageCount", () => {
  it("counts items, not copies", () => {
    expect(
      usageCount(
        [
          { option_groups: [copy(), copy({ id: "g3", label: "B" })] },
          { option_groups: [copy({ shared_id: "other" })] },
          {},
        ],
        "lib1",
      ),
    ).toBe(1);
  });
});

describe("removeLibraryGroup", () => {
  it("unlinks every copy and keeps them", () => {
    const r = removeLibraryGroup(
      [sugar],
      [
        { option_groups: [copy()] },
        { option_groups: [copy({ shared_id: "z" })] },
        {},
      ],
      "lib1",
    );
    expect(r.library).toEqual([]);
    expect(r.items[0]?.option_groups).toEqual([
      { id: "g1", label: "Sugar", choices: [{ id: "old", label: "Old" }] },
    ]);
    expect(r.items[1]?.option_groups?.[0]?.shared_id).toBe("z");
  });
});

describe("promoteToLibrary", () => {
  const grp: OptionGroup = { id: "g1", label: "Ice", choices: sugar.choices };
  it("adds a library entry and links the original", () => {
    expect(
      promoteToLibrary([], { option_groups: [grp] }, "g1", "fresh"),
    ).toEqual({
      ok: true,
      value: {
        library: [{ ...grp, id: "fresh" }],
        item: { option_groups: [{ ...grp, shared_id: "fresh" }] },
      },
    });
  });
  it("rejects a duplicate library label", () => {
    const r = promoteToLibrary(
      [{ ...grp, id: "l" }],
      { option_groups: [grp] },
      "g1",
      "f",
    );
    expect(r.ok).toBe(false);
  });
  it("rejects a missing or already linked group", () => {
    expect(promoteToLibrary([], {}, "g1", "f").ok).toBe(false);
    expect(
      promoteToLibrary([], { option_groups: [copy()] }, "g1", "f").ok,
    ).toBe(false);
  });
});

describe("hasDuplicateGroupLabels", () => {
  it("flags a repeated label on one item", () => {
    expect(
      hasDuplicateGroupLabels([
        { option_groups: [copy(), copy({ id: "g2", label: "SUGAR " })] },
      ]),
    ).toBe(true);
    expect(hasDuplicateGroupLabels([{ option_groups: [copy()] }, {}])).toBe(
      false,
    );
  });
});
