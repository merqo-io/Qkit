import { describe, expect, it, vi, beforeEach } from "vitest";

const { createServiceClientMock } = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));

import {
  recordOpsEvent,
  recordOrderIncident,
  summarizeIncidents,
  type ServiceClient,
} from "./ops-events";

const VENDOR = "00000000-0000-4000-8000-0000000000a1";
const ORDER = "00000000-0000-4000-8000-0000000000b1";
const BOOTH = "00000000-0000-4000-8000-0000000000c1";

function insertClient(result: unknown) {
  const insert = vi.fn(() => result);
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as unknown as ServiceClient, from, insert };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  createServiceClientMock.mockReset();
});

describe("recordOpsEvent", () => {
  it("inserts the event row", async () => {
    const { client, from, insert } = insertClient(
      Promise.resolve({ error: null }),
    );
    await recordOpsEvent(client, {
      vendorId: VENDOR,
      kind: "action_error",
      ref: ORDER,
      code: "advanceOrder",
    });
    expect(from).toHaveBeenCalledWith("ops_events");
    expect(insert).toHaveBeenCalledWith({
      vendor_id: VENDOR,
      kind: "action_error",
      ref: ORDER,
      code: "advanceOrder",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("resolves and logs the code when the insert returns an error", async () => {
    const { client } = insertClient(
      Promise.resolve({ error: { code: "42P01", message: "missing" } }),
    );
    await expect(
      recordOpsEvent(client, {
        vendorId: VENDOR,
        kind: "webhook_rejected",
        ref: ORDER,
        code: "signature_invalid",
      }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith("ops_events insert failed", "42P01");
  });

  it("resolves when the client throws", async () => {
    const client = {
      from: () => {
        throw new Error("boom");
      },
    } as unknown as ServiceClient;
    await expect(
      recordOpsEvent(client, {
        vendorId: VENDOR,
        kind: "action_error",
        ref: ORDER,
        code: "bumpOrder",
      }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith("ops_events insert failed", "Error");
  });

  it("truncates ref and code to 64 characters", async () => {
    const { client, insert } = insertClient(Promise.resolve({ error: null }));
    await recordOpsEvent(client, {
      vendorId: VENDOR,
      kind: "action_error",
      ref: "r".repeat(70),
      code: "c".repeat(70),
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "r".repeat(64), code: "c".repeat(64) }),
    );
  });
});

function lookupClient(
  order: { booth_id: string } | null,
  booth: { vendor_id: string } | null,
) {
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn((table: string) => {
    if (table === "ops_events") return { insert };
    const data = table === "orders" ? order : booth;
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data, error: null }),
        }),
      }),
    };
  });
  return { client: { from }, insert };
}

describe("recordOrderIncident", () => {
  it("records against the vendor that owns the order's booth", async () => {
    const { client, insert } = lookupClient(
      { booth_id: BOOTH },
      { vendor_id: VENDOR },
    );
    createServiceClientMock.mockResolvedValue(client);
    await recordOrderIncident("action_error", ORDER, "cancelOrder");
    expect(insert).toHaveBeenCalledWith({
      vendor_id: VENDOR,
      kind: "action_error",
      ref: ORDER,
      code: "cancelOrder",
    });
  });

  it("records nothing when the order does not exist", async () => {
    const { client, insert } = lookupClient(null, null);
    createServiceClientMock.mockResolvedValue(client);
    await recordOrderIncident("webhook_rejected", ORDER, "signature_invalid");
    expect(insert).not.toHaveBeenCalled();
  });

  it("records nothing for a ref that is not a uuid", async () => {
    await recordOrderIncident("webhook_rejected", "unknown", "schema_invalid");
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("never throws when the service client cannot be created", async () => {
    createServiceClientMock.mockRejectedValue(new Error("no key"));
    await expect(
      recordOrderIncident("action_error", ORDER, "bumpOrder"),
    ).resolves.toBeUndefined();
  });
});

function summaryClient(
  rows: { kind: string; ref: string; code: string; created_at: string }[],
  error: { message: string } | null = null,
) {
  const range = vi.fn((from: number, to: number) =>
    Promise.resolve({
      data: error ? null : rows.slice(from, to + 1),
      error,
    }),
  );
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range,
  };
  return {
    client: { from: vi.fn(() => chain) } as unknown as ServiceClient,
    chain,
  };
}

describe("summarizeIncidents", () => {
  it("groups by kind with counts and lastAt, recent newest first capped at 10", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      kind: i % 3 === 0 ? "webhook_rejected" : "action_error",
      ref: `ref-${i}`,
      code: "advanceOrder",
      created_at: new Date(
        Date.UTC(2026, 9, 29, 12, 0, 0) - i * 60_000,
      ).toISOString(),
    }));
    const { client, chain } = summaryClient(rows);
    const result = await summarizeIncidents(client, VENDOR, 72);
    expect(chain.eq).toHaveBeenCalledWith("vendor_id", VENDOR);
    expect(chain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(result?.incidents).toEqual([
      { kind: "action_error", count: 8, lastAt: rows[1]!.created_at },
      { kind: "webhook_rejected", count: 4, lastAt: rows[0]!.created_at },
    ]);
    expect(result?.recent).toHaveLength(10);
    expect(result?.recent[0]).toEqual({
      kind: "webhook_rejected",
      ref: "ref-0",
      code: "advanceOrder",
      at: rows[0]!.created_at,
    });
    expect(result?.recent[9]!.ref).toBe("ref-9");
  });

  it("returns empty lists when there are no events", async () => {
    const { client } = summaryClient([]);
    expect(await summarizeIncidents(client, VENDOR)).toEqual({
      incidents: [],
      recent: [],
    });
  });

  it("returns null when the read fails", async () => {
    const { client } = summaryClient([], { message: "missing table" });
    expect(await summarizeIncidents(client, VENDOR)).toBeNull();
  });
});
