import { describe, expect, it } from "vitest";
import {
  loginSchema,
  vendorSchema,
  menuItemSchema,
  menuItemFormSchema,
  boothFormSchema,
  placeOrderSchema,
  orderStatusSchema,
  sanitizeOptionGroups,
  parseBoothHours,
  parseMenuItems,
  parseOrderItems,
  paymentMarkerSchema,
  profileNameSchema,
  displayNameSchema,
  passwordChangeSchema,
  boardSettingsSchema,
  parseOrderRef,
  parsePreClaimRef,
  socialLinksSchema,
  parseSocialLinks,
  resolveSocialLinks,
  ALLERGEN_TAGS,
} from "./schemas";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

describe("parseOrderRef", () => {
  it("accepts a valid (boothId, orderNumber, token) triple", () => {
    const r = parseOrderRef(UUID_A, "0042", UUID_B);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.ref).toEqual({
        boothId: UUID_A,
        orderNumber: "0042",
        token: UUID_B,
      });
  });

  it("reports the booth field first when boothId is not a UUID", () => {
    const r = parseOrderRef("not-a-uuid", "0042", UUID_B);
    expect(r).toEqual({ ok: false, field: "booth" });
  });

  it("reports orderNumber when it's empty or too long", () => {
    expect(parseOrderRef(UUID_A, "", UUID_B)).toEqual({
      ok: false,
      field: "orderNumber",
    });
    expect(parseOrderRef(UUID_A, "x".repeat(41), UUID_B)).toEqual({
      ok: false,
      field: "orderNumber",
    });
  });

  it("reports token when it's not a UUID", () => {
    expect(parseOrderRef(UUID_A, "0042", "nope")).toEqual({
      ok: false,
      field: "token",
    });
  });

  it("first failure wins (booth before token)", () => {
    expect(parseOrderRef("bad", "0042", "also-bad")).toEqual({
      ok: false,
      field: "booth",
    });
  });
});

describe("parsePreClaimRef", () => {
  it("accepts a valid (boothId, token) pair", () => {
    const r = parsePreClaimRef(UUID_A, UUID_B);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ref).toEqual({ boothId: UUID_A, token: UUID_B });
  });

  it("rejects an invalid booth id", () => {
    expect(parsePreClaimRef("not-a-uuid", UUID_B)).toEqual({
      ok: false,
      field: "booth",
    });
  });

  it("rejects an invalid token", () => {
    expect(parsePreClaimRef(UUID_A, "not-a-uuid")).toEqual({
      ok: false,
      field: "token",
    });
  });
});

describe("loginSchema", () => {
  it("accepts a valid email + 8-char password", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.co", password: "12345678" }).success,
    ).toBe(true);
  });

  it("rejects a password shorter than 8", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.co", password: "1234567" }).success,
    ).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "12345678" })
        .success,
    ).toBe(false);
  });
});

describe("orderStatusSchema", () => {
  it.each([
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "completed",
    "cancelled",
  ])("accepts %s", (status) => {
    expect(orderStatusSchema.safeParse(status).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(orderStatusSchema.safeParse("shipped").success).toBe(false);
    expect(orderStatusSchema.safeParse("").success).toBe(false);
  });
});

describe("vendorSchema", () => {
  it("accepts a valid stall name", () => {
    expect(vendorSchema.safeParse({ name: "Mama's Kitchen" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(vendorSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name over 100 chars", () => {
    expect(vendorSchema.safeParse({ name: "x".repeat(101) }).success).toBe(
      false,
    );
  });
});

describe("profileNameSchema", () => {
  it("accepts a valid stall name", () => {
    expect(profileNameSchema.safeParse({ name: "Kopitiam Cart" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(profileNameSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name over 100 chars", () => {
    expect(profileNameSchema.safeParse({ name: "x".repeat(101) }).success).toBe(
      false,
    );
  });
});

describe("displayNameSchema", () => {
  it("accepts a personal name", () => {
    expect(displayNameSchema.safeParse({ displayName: "Aisha" }).success).toBe(
      true,
    );
  });

  it("accepts an empty string (clears the name)", () => {
    expect(displayNameSchema.safeParse({ displayName: "" }).success).toBe(true);
  });

  it("rejects a name over 60 chars", () => {
    expect(
      displayNameSchema.safeParse({ displayName: "x".repeat(61) }).success,
    ).toBe(false);
  });
});

describe("passwordChangeSchema", () => {
  it("accepts matching passwords of at least 8 chars", () => {
    expect(
      passwordChangeSchema.safeParse({
        password: "hunter22",
        confirm: "hunter22",
      }).success,
    ).toBe(true);
  });

  it("rejects a password shorter than 8", () => {
    expect(
      passwordChangeSchema.safeParse({ password: "short", confirm: "short" })
        .success,
    ).toBe(false);
  });

  it("rejects when confirm does not match", () => {
    const res = passwordChangeSchema.safeParse({
      password: "hunter22",
      confirm: "hunter23",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.path).toEqual(["confirm"]);
    }
  });
});

describe("boardSettingsSchema", () => {
  const valid = {
    aging_min: 5,
    overdue_min: 10,
    sound_id: "chime" as const,
    desktop_notify: false,
    undo_seconds: 4,
    daily_order_number_reset: false,
    show_wait_estimate: true,
    default_prep_minutes: null,
    ready_auto_clear_min: 3,
  };

  it("accepts the default shape", () => {
    expect(boardSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects overdue_min <= aging_min", () => {
    const res = boardSettingsSchema.safeParse({
      ...valid,
      aging_min: 10,
      overdue_min: 10,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.path).toEqual(["overdue_min"]);
    }
  });

  it("rejects an unknown sound_id", () => {
    expect(
      boardSettingsSchema.safeParse({ ...valid, sound_id: "airhorn" }).success,
    ).toBe(false);
  });

  it("rejects a threshold over the 240min cap", () => {
    expect(
      boardSettingsSchema.safeParse({ ...valid, overdue_min: 241 }).success,
    ).toBe(false);
  });

  it("rejects undo_seconds outside the 2-15s range", () => {
    expect(
      boardSettingsSchema.safeParse({ ...valid, undo_seconds: 1 }).success,
    ).toBe(false);
    expect(
      boardSettingsSchema.safeParse({ ...valid, undo_seconds: 16 }).success,
    ).toBe(false);
  });

  it("accepts a null default_prep_minutes (no fallback configured)", () => {
    expect(
      boardSettingsSchema.safeParse({ ...valid, default_prep_minutes: null })
        .success,
    ).toBe(true);
  });

  it("rejects default_prep_minutes outside the 1-60min range", () => {
    expect(
      boardSettingsSchema.safeParse({ ...valid, default_prep_minutes: 0 })
        .success,
    ).toBe(false);
    expect(
      boardSettingsSchema.safeParse({ ...valid, default_prep_minutes: 61 })
        .success,
    ).toBe(false);
  });

  it("defaults customer_telegram_notify_enabled to true when absent (backward compat for every pre-existing vendor row)", () => {
    const res = boardSettingsSchema.safeParse(valid);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.customer_telegram_notify_enabled).toBe(true);
    }
  });

  it("parses customer_telegram_notify_enabled: false", () => {
    const res = boardSettingsSchema.safeParse({
      ...valid,
      customer_telegram_notify_enabled: false,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.customer_telegram_notify_enabled).toBe(false);
    }
  });

  it("defaults pickup_scan_enabled to false when missing", () => {
    const result = boardSettingsSchema.safeParse(valid);
    expect(result.success && result.data.pickup_scan_enabled).toBe(false);
  });
});

describe("menuItemSchema", () => {
  it("accepts an item with no price", () => {
    expect(
      menuItemSchema.safeParse({
        id: "1",
        name: "Free water",
        available: true,
      }).success,
    ).toBe(true);
  });

  it("accepts an item with a price", () => {
    expect(
      menuItemSchema.safeParse({
        id: "1",
        name: "Laksa",
        price_cents: 600,
        available: true,
      }).success,
    ).toBe(true);
  });
});

describe("ALLERGEN_TAGS", () => {
  it("covers the EU's 14-allergen list (Regulation 1169/2011)", () => {
    const euAllergens = [
      "gluten",
      "crustaceans",
      "egg",
      "fish",
      "peanuts",
      "soy",
      "dairy",
      "nuts",
      "celery",
      "mustard",
      "sesame",
      "sulphites",
      "lupin",
      "molluscs",
    ];
    for (const allergen of euAllergens) {
      expect(ALLERGEN_TAGS).toContain(allergen);
    }
  });

  it("still validates every pre-existing tag value, unrenamed", () => {
    const original = ["dairy", "nuts", "gluten", "soy", "egg", "caffeine"];
    for (const tag of original) {
      expect(ALLERGEN_TAGS).toContain(tag);
    }
  });

  it("accepts a saved menu item using only pre-existing tags", () => {
    expect(
      menuItemFormSchema.safeParse({
        id: "1",
        name: "Latte",
        description: "",
        available: true,
        allergens: ["dairy", "caffeine"],
      }).success,
    ).toBe(true);
  });
});

describe("boothFormSchema", () => {
  const base = {
    name: "Test Stall",
    image_url: null,
    is_active: true,
    menu_items: [],
  };

  it("accepts a minimal valid booth (no id = create)", () => {
    expect(boothFormSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(boothFormSchema.safeParse({ ...base, name: "" }).success).toBe(
      false,
    );
  });

  it("accepts a uuid boothId (update)", () => {
    expect(
      boothFormSchema.safeParse({
        ...base,
        boothId: "742a0959-e065-41f8-ab27-27eaa3c02a1b",
      }).success,
    ).toBe(true);
  });

  it("accepts items with and without prices", () => {
    expect(
      boothFormSchema.safeParse({
        ...base,
        menu_items: [
          { id: "1", name: "Paid", price_cents: 500, available: true },
          { id: "2", name: "Free", available: false },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("placeOrderSchema", () => {
  it("accepts an order containing a $0 (queue) item", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [
          { menuItemId: "1", name: "Free water", price_cents: 0, quantity: 1 },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts an order with an unpriced item", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [{ menuItemId: "1", name: "Queue item", quantity: 2 }],
      }).success,
    ).toBe(true);
  });

  const item = (over = {}) => ({
    menuItemId: "1",
    name: "X",
    quantity: 1,
    ...over,
  });

  it("rejects an empty cart (needs at least one item)", () => {
    expect(
      placeOrderSchema.safeParse({ customerName: "Sam", items: [] }).success,
    ).toBe(false);
  });

  it("rejects an empty customer name", () => {
    expect(
      placeOrderSchema.safeParse({ customerName: "", items: [item()] }).success,
    ).toBe(false);
  });

  it("rejects a cart over the 50-line cap (V5)", () => {
    const items = Array.from({ length: 51 }, (_, i) =>
      item({ menuItemId: `${i}` }),
    );
    expect(
      placeOrderSchema.safeParse({ customerName: "Sam", items }).success,
    ).toBe(false);
  });

  it("rejects a price_cents beyond the money cap (V4 overflow guard)", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [item({ price_cents: 10_000_00 + 1 })],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["over the max of 20", 21],
  ])("rejects quantity %s", (_label, quantity) => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [item({ quantity })],
      }).success,
    ).toBe(false);
  });

  it("accepts the quantity boundaries 1 and 20", () => {
    for (const quantity of [1, 20]) {
      expect(
        placeOrderSchema.safeParse({
          customerName: "Sam",
          items: [item({ quantity })],
        }).success,
      ).toBe(true);
    }
  });

  it("rejects an empty menuItemId", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [item({ menuItemId: "" })],
      }).success,
    ).toBe(false);
  });
});

describe("menuItemFormSchema image_url", () => {
  const base = { id: "1", name: "Kopi O", description: "", available: true };

  it("accepts a bucket URL", () => {
    expect(
      menuItemFormSchema.safeParse({
        ...base,
        image_url: "https://abc.supabase.co/storage/v1/object/public/x.png",
      }).success,
    ).toBe(true);
  });

  it("accepts a relative /seed path", () => {
    expect(
      menuItemFormSchema.safeParse({ ...base, image_url: "/seed/kopi.svg" })
        .success,
    ).toBe(true);
  });

  it("accepts null", () => {
    expect(
      menuItemFormSchema.safeParse({ ...base, image_url: null }).success,
    ).toBe(true);
  });

  it("accepts a missing image_url", () => {
    expect(menuItemFormSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a bare non-url, non-path string", () => {
    expect(
      menuItemFormSchema.safeParse({ ...base, image_url: "kopi" }).success,
    ).toBe(false);
  });
});

describe("menuItemSchema option_groups", () => {
  it("parses an item with option groups", () => {
    const parsed = menuItemSchema.safeParse({
      id: "kopi",
      name: "Kopi",
      available: true,
      option_groups: [
        {
          id: "temp",
          label: "Temperature",
          choices: [
            { id: "hot", label: "Hot" },
            { id: "iced", label: "Iced" },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an item with no option groups", () => {
    expect(
      menuItemSchema.safeParse({ id: "x", name: "Water", available: true })
        .success,
    ).toBe(true);
  });

  it("accepts a multi-select group", () => {
    const parsed = menuItemSchema.safeParse({
      id: "burger",
      name: "Burger",
      available: true,
      option_groups: [
        {
          id: "addons",
          label: "Add-ons",
          multiple: true,
          choices: [
            { id: "egg", label: "Egg" },
            { id: "cheese", label: "Cheese" },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("sanitizeOptionGroups", () => {
  it("returns undefined for empty/undefined input", () => {
    expect(sanitizeOptionGroups(undefined)).toBeUndefined();
    expect(sanitizeOptionGroups([])).toBeUndefined();
  });

  it("drops a group with a blank label", () => {
    expect(
      sanitizeOptionGroups([
        { id: "g", label: "   ", choices: [{ id: "c", label: "X" }] },
      ]),
    ).toBeUndefined();
  });

  it("drops a group left with no non-blank choices", () => {
    expect(
      sanitizeOptionGroups([
        { id: "g", label: "Size", choices: [{ id: "c", label: "  " }] },
      ]),
    ).toBeUndefined();
  });

  it("trims labels and keeps valid groups, preserving multiple", () => {
    const result = sanitizeOptionGroups([
      {
        id: "g",
        label: "  Add-ons ",
        multiple: true,
        choices: [
          { id: "a", label: " Egg " },
          { id: "b", label: "" },
        ],
      },
    ]);
    expect(result).toEqual([
      {
        id: "g",
        label: "Add-ons",
        multiple: true,
        choices: [{ id: "a", label: "Egg" }],
      },
    ]);
  });
});

describe("placeOrderSchema options", () => {
  it("accepts an order item carrying selected options", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [
          {
            menuItemId: "kopi",
            name: "Kopi",
            price_cents: 140,
            quantity: 1,
            options: [
              { group: "Temperature", choice: "Iced" },
              { group: "Sugar", choice: "Less" },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed option (empty choice)", () => {
    expect(
      placeOrderSchema.safeParse({
        customerName: "Sam",
        items: [
          {
            menuItemId: "kopi",
            name: "Kopi",
            quantity: 1,
            options: [{ group: "Temperature", choice: "" }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("parseBoothHours", () => {
  it("returns null for null / undefined / garbage", () => {
    expect(parseBoothHours(null)).toBeNull();
    expect(parseBoothHours(undefined)).toBeNull();
    expect(parseBoothHours({ mode: "monthly" })).toBeNull();
    expect(parseBoothHours("nope")).toBeNull();
  });

  it("passes a valid daily window through", () => {
    expect(
      parseBoothHours({ mode: "daily", open: "10:00", close: "18:00" }),
    ).toEqual({ mode: "daily", open: "10:00", close: "18:00" });
  });

  it("degrades a daily window with a malformed time to null", () => {
    expect(
      parseBoothHours({ mode: "daily", open: "10am", close: "18:00" }),
    ).toBeNull();
  });

  it.each([
    ["a single-digit hour", "9:00"],
    ["trailing garbage (no $ anchor)", "09:00x"],
    ["leading garbage (no ^ anchor)", "x09:00"],
    ["three-digit hour", "100:00"],
  ])("rejects %s as the open time", (_label, open) => {
    expect(parseBoothHours({ mode: "daily", open, close: "18:00" })).toBeNull();
  });

  it("passes a valid weekly schedule through", () => {
    const weekly = {
      mode: "weekly" as const,
      days: {
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: { open: "10:00", close: "18:00" },
        sat: null,
        sun: null,
      },
    };
    expect(parseBoothHours(weekly)).toEqual(weekly);
  });
});

describe("parseMenuItems", () => {
  it("returns [] for a non-array", () => {
    expect(parseMenuItems(null)).toEqual([]);
    expect(parseMenuItems({})).toEqual([]);
  });

  it("keeps valid items and drops malformed ones", () => {
    const out = parseMenuItems([
      { id: "kopi", name: "Kopi", available: true },
      { id: "bad" }, // missing name + available
      { id: "teh", name: "Teh", price_cents: 140, available: false },
    ]);
    expect(out.map((i) => i.id)).toEqual(["kopi", "teh"]);
    expect(out[0].description).toBe(""); // default applied
  });
});

describe("parseOrderItems", () => {
  it("returns [] for a non-array", () => {
    expect(parseOrderItems("nope")).toEqual([]);
  });

  it("keeps valid items and drops malformed ones", () => {
    const out = parseOrderItems([
      { menuItemId: "kopi", name: "Kopi", quantity: 2 },
      { menuItemId: "bad", name: "Bad", quantity: 0 }, // quantity < 1
      { name: "NoId", quantity: 1 }, // missing menuItemId
    ]);
    expect(out.map((i) => i.menuItemId)).toEqual(["kopi"]);
    expect(out[0].quantity).toBe(2);
  });
});

describe("paymentMarkerSchema", () => {
  it.each(["paynow", "pointer"])("accepts the %s kind", (kind) => {
    expect(paymentMarkerSchema.safeParse({ kind }).success).toBe(true);
  });

  it("keeps only the kind of a value that carries more", () => {
    expect(
      paymentMarkerSchema.parse({ kind: "paynow", payee_name: "Cart" }),
    ).toEqual({ kind: "paynow" });
  });

  it.each([{ kind: "stripe" }, { kind: "cash" }, {}, null, "paynow"])(
    "rejects %j",
    (value) => {
      expect(paymentMarkerSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("boothFormSchema takes_payment", () => {
  const base = { name: "Cart", image_url: null, is_active: true };

  it("defaults to a booth that takes no payment", () => {
    expect(boothFormSchema.parse(base).takes_payment).toBe(false);
  });

  it("carries the switch, and no payment detail", () => {
    const parsed = boothFormSchema.parse({
      ...base,
      takes_payment: true,
      payment: { kind: "paynow", payee_name: "Cart", uen: "53312345A" },
    });
    expect(parsed.takes_payment).toBe(true);
    expect(parsed).not.toHaveProperty("payment");
  });

  it("rejects a switch that is not a boolean", () => {
    expect(
      boothFormSchema.safeParse({ ...base, takes_payment: "yes" }).success,
    ).toBe(false);
  });
});

describe("socialLinksSchema", () => {
  it("accepts a fully-populated set of http(s) links", () => {
    const parsed = socialLinksSchema.safeParse({
      website: "https://example.com",
      instagram: "https://instagram.com/example",
      facebook: "https://facebook.com/example",
      tiktok: "https://tiktok.com/@example",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty object (nothing set)", () => {
    expect(socialLinksSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a bare domain with no protocol", () => {
    const parsed = socialLinksSchema.safeParse({ website: "example.com" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a javascript: URL", () => {
    const parsed = socialLinksSchema.safeParse({
      instagram: "javascript:alert(1)",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("parseSocialLinks", () => {
  it("degrades malformed/missing data to an empty object", () => {
    expect(parseSocialLinks(null)).toEqual({});
    expect(parseSocialLinks(undefined)).toEqual({});
    expect(parseSocialLinks("nope")).toEqual({});
    expect(parseSocialLinks({ website: "not-a-url" })).toEqual({});
  });

  it("passes through a valid object", () => {
    expect(parseSocialLinks({ website: "https://a.b" })).toEqual({
      website: "https://a.b",
    });
  });
});

describe("resolveSocialLinks", () => {
  it("uses the vendor default when the booth has no override", () => {
    const vendorLinks = { website: "https://vendor.example" };
    expect(resolveSocialLinks(null, vendorLinks)).toEqual(vendorLinks);
  });

  it("uses the booth override completely, even if partial", () => {
    const vendorLinks = {
      website: "https://vendor.example",
      instagram: "https://instagram.com/vendor",
    };
    const boothLinks = { instagram: "https://instagram.com/this-booth" };
    expect(resolveSocialLinks(boothLinks, vendorLinks)).toEqual(boothLinks);
  });

  it("returns an empty object when neither is set", () => {
    expect(resolveSocialLinks(null, {})).toEqual({});
  });
});
