import { describe, it, expect } from "vitest";
import {
  menuItemsToCsv,
  menuCsvTemplate,
  csvToMenuItems,
  optionGroupsFromCsvChoices,
  type CsvChoiceRow,
} from "./menu-csv";
import type { MenuItemFormInput } from "./schemas";

const HEADER =
  "name,description,price,cost,available,group_name,group_type,choice_label,choice_price,choice_code";

const item = (patch: Partial<MenuItemFormInput> = {}): MenuItemFormInput => ({
  id: "1",
  name: "Kopi O",
  description: "",
  price_cents: 180,
  image_url: null,
  available: true,
  ...patch,
});

describe("menuItemsToCsv", () => {
  it.each([
    "First line\nSecond line",
    "First line\r\nSecond line",
    "First line\rSecond line",
  ])("round-trips multiline descriptions: %j", (description) => {
    const rows = csvToMenuItems(
      menuItemsToCsv([item({ description }), item({ name: "Tea" })]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "Kopi O",
      description,
      price_cents: 180,
    });
    expect(rows[1]).toMatchObject({ name: "Tea", price_cents: 180 });
  });
  it("writes a header row plus one row per item, no trailing columns for a plain item", () => {
    const csv = menuItemsToCsv([item()]);
    expect(csv).toBe(`${HEADER}\nKopi O,,1.80,,true,,,,,`);
  });

  it("omits price/cost for an item with neither", () => {
    const csv = menuItemsToCsv([item({ price_cents: undefined })]);
    expect(csv).toContain("Kopi O,,,,true,,,,,");
  });

  it("writes cost when set", () => {
    const csv = menuItemsToCsv([item({ cost_cents: 60 })]);
    expect(csv).toContain("Kopi O,,1.80,0.60,true,,,,,");
  });

  it("writes a continuation row per choice, grouped under the item", () => {
    const csv = menuItemsToCsv([
      item({
        option_groups: [
          {
            id: "g1",
            label: "Style",
            multiple: false,
            choices: [
              { id: "c1", label: "Regular" },
              { id: "c2", label: "Oat Milk", price_delta_cents: 50 },
            ],
          },
        ],
      }),
    ]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[2]).toBe(",,,,,Style,one,Regular,,");
    expect(lines[3]).toBe(",,,,,Style,one,Oat Milk,0.50,");
  });

  it("marks a multi-select group's type as any", () => {
    const csv = menuItemsToCsv([
      item({
        option_groups: [
          {
            id: "g1",
            label: "Add-ons",
            multiple: true,
            choices: [{ id: "c1", label: "Extra shot" }],
          },
        ],
      }),
    ]);
    expect(csv).toContain(",,,,,Add-ons,any,Extra shot,,");
  });

  it("quotes a description containing a comma", () => {
    const csv = menuItemsToCsv([
      item({ description: "Hot, strong, no sugar" }),
    ]);
    expect(csv).toContain('"Hot, strong, no sugar"');
  });
});

describe("menuCsvTemplate", () => {
  it("parses clean, with no error rows", () => {
    const rows = csvToMenuItems(menuCsvTemplate());
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.error).toBeUndefined();
  });

  it("demonstrates a blank price and a set cost", () => {
    const rows = csvToMenuItems(menuCsvTemplate());
    expect(
      rows.some((r) => r.price_cents === null || r.price_cents === undefined),
    ).toBe(true);
    expect(
      rows.some((r) => r.cost_cents !== null && r.cost_cents !== undefined),
    ).toBe(true);
  });

  it("carries no example customization rows", () => {
    const rows = csvToMenuItems(menuCsvTemplate());
    for (const row of rows) expect(row.choices).toHaveLength(0);
  });
});

describe("csvToMenuItems — item rows", () => {
  it("round-trips a plain row", () => {
    const csv = menuItemsToCsv([item({ description: "Classic" })]);
    const [row] = csvToMenuItems(csv);
    expect(row).toEqual({
      name: "Kopi O",
      description: "Classic",
      price_cents: 180,
      cost_cents: undefined,
      available: true,
      choices: [],
    });
  });

  it("round-trips cost alongside price", () => {
    const csv = menuItemsToCsv([item({ cost_cents: 60 })]);
    const [row] = csvToMenuItems(csv);
    expect(row.cost_cents).toBe(60);
    expect(row.price_cents).toBe(180);
  });

  it("skips the header line", () => {
    const rows = csvToMenuItems(`${HEADER}\nA,,,,true,,,,`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("A");
  });

  it("flags a row with no name, naming its real spreadsheet row", () => {
    const rows = csvToMenuItems(`${HEADER}\n,,1.00,,true,,,,`);
    expect(rows[0]!.error).toBe("Row 2: Missing item name");
  });

  it("flags an unparseable or negative price", () => {
    const free = csvToMenuItems(`${HEADER}\nKopi O,,free,,true,,,,`);
    expect(free[0]!.error).toContain("Invalid price");
    const negative = csvToMenuItems(`${HEADER}\nKopi O,,-1,,true,,,,`);
    expect(negative[0]!.error).toContain("Invalid price");
  });

  it("flags an unparseable or negative cost", () => {
    const free = csvToMenuItems(`${HEADER}\nKopi O,,1.80,free,true,,,,`);
    expect(free[0]!.error).toContain("Invalid cost");
    const negative = csvToMenuItems(`${HEADER}\nKopi O,,1.80,-1,true,,,,`);
    expect(negative[0]!.error).toContain("Invalid cost");
  });

  it("treats a blank price or cost as unset, not an error", () => {
    const rows = csvToMenuItems(`${HEADER}\nKopi O,,,,true,,,,`);
    expect(rows[0]!.error).toBeUndefined();
    expect(rows[0]!.price_cents).toBeUndefined();
    expect(rows[0]!.cost_cents).toBeUndefined();
  });

  it("defaults available to true unless the cell is exactly false", () => {
    const rows = csvToMenuItems(
      `${HEADER}\nA,,,,,,,,\nB,,,,false,,,,\nC,,,,true,,,,`,
    );
    expect(rows.map((r) => r.available)).toEqual([true, false, true]);
  });

  it("returns no rows for an empty or header-only input", () => {
    expect(csvToMenuItems("")).toEqual([]);
    expect(csvToMenuItems(HEADER)).toEqual([]);
  });
});

describe("csvToMenuItems — choice rows", () => {
  it("attaches consecutive choice rows to the item above them", () => {
    const rows = csvToMenuItems(
      `${HEADER}\nKopi,,1.40,,true,,,,\n,,,,,Style,one,O (black),\n,,,,,Style,one,C (evaporated milk),0.20`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.choices).toHaveLength(2);
    expect(rows[0]!.choices[0]).toEqual({
      groupName: "Style",
      groupType: "one",
      choiceLabel: "O (black)",
      choicePrice_cents: undefined,
    });
    expect(rows[0]!.choices[1]!.choicePrice_cents).toBe(20);
  });

  it("reads group_type any as multi-select, anything else as one", () => {
    const rows = csvToMenuItems(
      `${HEADER}\nKopi,,1.40,,true,,,,\n,,,,,Add-ons,any,Extra shot,`,
    );
    expect(rows[0]!.choices[0]!.groupType).toBe("any");
  });

  it("flags a choice row missing either group_name or choice_label", () => {
    const rows = csvToMenuItems(
      `${HEADER}\nKopi,,1.40,,true,,,,\n,,,,,Style,one,,\n,,,,,,,O (black),`,
    );
    expect(rows[0]!.choices[0]!.error).toContain(
      "needs both a group name and a choice label",
    );
    expect(rows[0]!.choices[1]!.error).toContain(
      "needs both a group name and a choice label",
    );
  });

  it("flags an unparseable or negative choice price", () => {
    const rows = csvToMenuItems(
      `${HEADER}\nKopi,,1.40,,true,,,,\n,,,,,Style,one,O (black),free`,
    );
    expect(rows[0]!.choices[0]!.error).toContain("Invalid choice price");
    const negative = csvToMenuItems(
      `${HEADER}\nKopi,,1.40,,true,,,,\n,,,,,Style,one,O (black),-1`,
    );
    expect(negative[0]!.choices[0]!.error).toContain("Invalid choice price");
  });

  it("flags a choice row with no item row above it", () => {
    const rows = csvToMenuItems(`${HEADER}\n,,,,,Style,one,O (black),`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.error).toBe(
      "Row 2: customization row has no item above it",
    );
  });

  it("starts a new group on a group_name change, even for the same item", () => {
    const rows = csvToMenuItems(
      `${HEADER}\nKopi,,1.40,,true,,,,\n,,,,,Style,one,O (black),\n,,,,,Temp,one,Hot,`,
    );
    expect(rows[0]!.choices.map((c) => c.groupName)).toEqual(["Style", "Temp"]);
  });
});

describe("optionGroupsFromCsvChoices", () => {
  const choice = (patch: Partial<CsvChoiceRow> = {}): CsvChoiceRow => ({
    groupName: "Style",
    groupType: "one",
    choiceLabel: "O (black)",
    choicePrice_cents: undefined,
    ...patch,
  });

  it("groups consecutive same-groupName choices into one group", () => {
    const groups = optionGroupsFromCsvChoices([
      choice({ choiceLabel: "O (black)" }),
      choice({ choiceLabel: "C (evaporated milk)", choicePrice_cents: 20 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Style");
    expect(groups[0]!.choices).toHaveLength(2);
    expect(groups[0]!.choices[1]!.price_delta_cents).toBe(20);
  });

  it("starts a new group when groupName changes", () => {
    const groups = optionGroupsFromCsvChoices([
      choice({ groupName: "Style" }),
      choice({ groupName: "Temp", choiceLabel: "Hot" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Style", "Temp"]);
  });

  it("maps group_type any to multiple: true, one to multiple: false", () => {
    const groups = optionGroupsFromCsvChoices([
      choice({ groupName: "Add-ons", groupType: "any" }),
      choice({ groupName: "Style", groupType: "one" }),
    ]);
    expect(groups[0]!.multiple).toBe(true);
    expect(groups[1]!.multiple).toBe(false);
  });

  it("skips errored choice rows entirely", () => {
    const groups = optionGroupsFromCsvChoices([
      choice({ choiceLabel: "Valid" }),
      choice({ choiceLabel: "Bad", error: "Row 3: broken" }),
    ]);
    expect(groups[0]!.choices).toHaveLength(1);
    expect(groups[0]!.choices[0]!.label).toBe("Valid");
  });

  it("gives every group and choice a fresh id", () => {
    const groups = [
      ...optionGroupsFromCsvChoices([choice(), choice({ choiceLabel: "Oat" })]),
      ...optionGroupsFromCsvChoices([choice(), choice({ choiceLabel: "Oat" })]),
    ];
    const ids = groups.flatMap((group) => [
      group.id,
      ...group.choices.map((value) => value.id),
    ]);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(6);
  });
});

describe("spreadsheet-safe menu text", () => {
  it.each([
    "=1+1",
    "+SUM(1)",
    "-1+2",
    "@SUM(1)",
    "  =1+1",
    "\tformula",
    "\rformula",
    "\nformula",
  ])("exports %j as literal text", (value) => {
    const csv = menuItemsToCsv([
      item({
        name: value,
        description: value,
        option_groups: [
          {
            id: "g",
            label: value,
            multiple: false,
            choices: [{ id: "c", label: value, price_delta_cents: -100 }],
          },
        ],
      }),
    ]);
    expect(csv.split("'").length - 1).toBe(4);
    expect(csv).toContain(",-1.00");
    expect(csvToMenuItems(csv)[0].name).toBe("'" + value);
  });
});

describe("choice short codes", () => {
  const withCode = (code?: string): MenuItemFormInput =>
    item({
      option_groups: [
        {
          id: "g1",
          label: "Sugar",
          multiple: false,
          choices: [
            { id: "c1", label: "Less sugar", ...(code ? { code } : {}) },
          ],
        },
      ],
    });

  it("exports a choice's short code in the last column", () => {
    const lines = menuItemsToCsv([withCode("LS")]).split("\n");
    expect(lines[2]).toBe(",,,,,Sugar,one,Less sugar,,LS");
  });

  it("round-trips a short code through export and import", () => {
    const [row] = csvToMenuItems(menuItemsToCsv([withCode("LS")]));
    expect(row!.choices[0]!.choiceCode).toBe("LS");
    expect(optionGroupsFromCsvChoices(row!.choices)[0]!.choices[0]!.code).toBe(
      "LS",
    );
  });

  it("leaves a choice with no code printing in full", () => {
    const [row] = csvToMenuItems(menuItemsToCsv([withCode()]));
    expect(row!.choices[0]).not.toHaveProperty("choiceCode");
    expect(
      optionGroupsFromCsvChoices(row!.choices)[0]!.choices[0],
    ).not.toHaveProperty("code");
  });

  it("still reads a file exported before the column existed", () => {
    const rows = csvToMenuItems(
      "name,description,price,cost,available,group_name,group_type,choice_label,choice_price\nKopi,,1.40,,true,,,,\n,,,,,Sugar,one,Less sugar,0.20",
    );
    expect(rows[0]!.error).toBeUndefined();
    expect(rows[0]!.choices[0]).toEqual({
      groupName: "Sugar",
      groupType: "one",
      choiceLabel: "Less sugar",
      choicePrice_cents: 20,
    });
  });

  it("trims a code and flags one longer than the ticket allows", () => {
    const rows = csvToMenuItems(
      `${HEADER}\nKopi,,1.40,,true,,,,,\n,,,,,Sugar,one,Less sugar,, LS \n,,,,,Sugar,one,No sugar,,NOSUGAR`,
    );
    expect(rows[0]!.choices[0]!.choiceCode).toBe("LS");
    expect(rows[0]!.choices[1]!.error).toBe(
      'Row 4: Short code "NOSUGAR" is longer than 6 characters',
    );
    expect(rows[0]!.choices[1]).not.toHaveProperty("choiceCode");
  });
});
