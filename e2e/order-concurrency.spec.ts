import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// The order RPC under real concurrency against local Postgres. The server path
// (booth row lock, idempotency conflict, cap trigger) is what must hold, so
// these call qkit.place_order directly: anon clients for customers, the
// service-role client only for fixtures and assertions. Every test gets a fresh
// booth so the SQL limiters (booth flood 120/60s, cart hold 180/60s) and the
// order counter never bleed between cases.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const MENU = [
  { id: "kopi", name: "Kopi", price_cents: 140, available: true },
  { id: "teh", name: "Teh", price_cents: 140, available: true },
];

type Line = { menuItemId: string; quantity: number };
type Client = ReturnType<typeof newClient>;
type Outcome = {
  data: { order_number: string; booth_id: string; access_token: string } | null;
  error: { code?: string; message: string } | null;
};
type OrderRow = {
  id: string;
  order_number: string | null;
  access_token: string;
  customer_name: string;
  items: Line[];
};

// Returns why the suite cannot run, or null. Fixtures write to the database,
// so a non-local project is a hard error, not a skip.
async function unavailableReason(): Promise<string | null> {
  if (!url || !anonKey || !secretKey) {
    return "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY are not set";
  }
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `Order concurrency e2e refuses a non-local Supabase (${host})`,
    );
  }
  try {
    await fetch(`${url}/auth/v1/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return null;
  } catch {
    return `local Supabase is unreachable at ${url}`;
  }
}

function newClient(key: string) {
  return createClient(url as string, key, {
    db: { schema: "qkit" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe.configure({ mode: "serial" });

test.describe("place_order under concurrency", () => {
  let admin: Client;
  let vendorId: string | undefined;

  test.beforeAll(async () => {
    const reason = await unavailableReason();
    // Skipped on purpose when the local stack is absent, like the other specs that need it.
    test.skip(reason !== null, reason ?? "");
    admin = newClient(secretKey as string);

    // A pro vendor, so every fresh booth serves (a free vendor serves only its
    // oldest booth), isolated from the seeded vendor's data.
    const { data, error } = await admin.auth.admin.createUser({
      email: `concurrency-${randomUUID()}@qkit.local`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    vendorId = data.user.id;
    const vendor = await admin
      .from("vendors")
      .insert({ id: vendorId, plan: "pro" });
    if (vendor.error) throw new Error(`vendor: ${vendor.error.message}`);
  });

  test.afterAll(async () => {
    // Booths and orders cascade from the vendor row, which cascades from auth.
    if (admin && vendorId) await admin.auth.admin.deleteUser(vendorId);
  });

  async function freshBooth(cap: number | null = null) {
    const shortCode = randomUUID().replace(/-/g, "").slice(0, 12);
    const { data, error } = await admin
      .from("booths")
      .insert({
        vendor_id: vendorId,
        name: `Concurrency ${shortCode}`,
        short_code: shortCode,
        is_active: true,
        menu_items: MENU,
        daily_cup_cap: cap,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`booth: ${error?.message}`);
    return { id: data.id as string, shortCode };
  }

  function place(
    shortCode: string,
    name: string,
    items: Line[],
    key: string = randomUUID(),
  ): PromiseLike<Outcome> {
    return newClient(anonKey as string)
      .rpc("place_order", {
        p_short_code: shortCode,
        p_customer_name: name,
        p_items: items,
        p_idempotency_key: key,
      })
      .then((r) => r as unknown as Outcome);
  }

  async function rows(boothId: string): Promise<OrderRow[]> {
    const { data, error } = await admin
      .from("orders")
      .select("id, order_number, access_token, customer_name, items")
      .eq("booth_id", boothId);
    if (error) throw new Error(`orders: ${error.message}`);
    return data as OrderRow[];
  }

  // A refusal must be a raised business error (P0001, ORDER_*), never a
  // deadlock, serialization failure or unique violation.
  function expectCleanRefusal(o: Outcome) {
    expect(o.error?.code).toBe("P0001");
    expect(o.error?.message).toMatch(/^ORDER_/);
  }

  test("burst of distinct customers gets unique numbers and loses no rows", async () => {
    const booth = await freshBooth();
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        place(booth.shortCode, `Burst ${i}`, [
          { menuItemId: "kopi", quantity: 1 },
        ]),
      ),
    );

    const accepted = outcomes.filter((o) => o.data);
    outcomes.filter((o) => !o.data).forEach(expectCleanRefusal);
    // Well under the 120/60s flood limit, so nothing here may be refused.
    expect(accepted).toHaveLength(20);

    const numbers = accepted.map((o) => o.data?.order_number as string);
    expect(new Set(numbers).size).toBe(accepted.length);
    expect(new Set(accepted.map((o) => o.data?.access_token)).size).toBe(
      accepted.length,
    );

    const stored = await rows(booth.id);
    expect(stored).toHaveLength(accepted.length);
    expect(stored.map((r) => r.order_number).sort()).toEqual(
      [...numbers].sort(),
    );
  });

  test("a repeated idempotency key from concurrent taps makes exactly one order", async () => {
    const booth = await freshBooth();
    const key = randomUUID();
    const items = [{ menuItemId: "teh", quantity: 2 }];
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        place(booth.shortCode, "Double", items, key),
      ),
    );

    outcomes.forEach((o) => expect(o.error).toBeNull());
    expect(new Set(outcomes.map((o) => o.data?.order_number)).size).toBe(1);
    expect(new Set(outcomes.map((o) => o.data?.access_token)).size).toBe(1);

    const stored = await rows(booth.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].order_number).toBe(outcomes[0].data?.order_number);
    expect(stored[0].access_token).toBe(outcomes[0].data?.access_token);
  });

  test("competing baskets for the last cup never exceed the daily cap", async () => {
    const cap = 3;
    const booth = await freshBooth(cap);

    const first = await place(booth.shortCode, "Early", [
      { menuItemId: "kopi", quantity: cap - 1 },
    ]);
    expect(first.error).toBeNull();

    // One cup is left; six single-cup baskets and two double-cup baskets race for it.
    const baskets: Line[][] = [
      ...Array.from({ length: 6 }, () => [{ menuItemId: "kopi", quantity: 1 }]),
      ...Array.from({ length: 2 }, () => [{ menuItemId: "teh", quantity: 2 }]),
    ];
    const outcomes = await Promise.all(
      baskets.map((items, i) => place(booth.shortCode, `Racer ${i}`, items)),
    );

    const refused = outcomes.filter((o) => !o.data);
    refused.forEach(expectCleanRefusal);
    refused.forEach((o) =>
      expect(o.error?.message).toMatch(/^ORDER_(CAP_REACHED|SOLD_OUT)/),
    );

    const stored = await rows(booth.id);
    const cups = stored.reduce(
      (sum, r) => sum + r.items.reduce((s, l) => s + l.quantity, 0),
      0,
    );
    expect(cups).toBeLessThanOrEqual(cap);
    expect(outcomes.filter((o) => o.data)).toHaveLength(1);
    expect(stored).toHaveLength(2);
    expect(cups).toBe(cap);
  });

  test("two independent customers with the same name get distinct orders", async () => {
    const booth = await freshBooth();
    const items = [{ menuItemId: "kopi", quantity: 1 }];
    const [a, b] = await Promise.all([
      place(booth.shortCode, "Ada", items),
      place(booth.shortCode, "Ada", items),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data?.order_number).not.toBe(b.data?.order_number);
    expect(a.data?.access_token).not.toBe(b.data?.access_token);

    const stored = await rows(booth.id);
    expect(stored).toHaveLength(2);
    expect(new Set(stored.map((r) => r.id)).size).toBe(2);
    expect(stored.every((r) => r.customer_name === "Ada")).toBe(true);
  });
});
