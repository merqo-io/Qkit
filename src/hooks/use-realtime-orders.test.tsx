// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useRealtimeOrders } from "./use-realtime-orders";
import type { BoardOrder } from "@/lib/types";

function order(overrides: Partial<BoardOrder> = {}): BoardOrder {
  return {
    id: "o1",
    booth_id: "b1",
    order_number: "0001",
    customer_name: "Priya",
    items: [{ menuItemId: "m1", name: "Flat White", quantity: 1 }],
    status: "preparing",
    total_cents: 550,
    payment_status: "not_required",
    payment_method_kind: null,
    paid_at: null,
    payment_proof_path: null,
    payment_proof_hash: null,
    print_status: "not_required",
    print_status_updated_at: null,
    created_at: "2026-06-12T04:00:00Z",
    ready_at: null,
    completed_at: null,
    updated_at: "2026-06-12T04:00:00Z",
    idempotency_key: null,
    priority_bumped_at: null,
    source: "qr",
    auto_completed: false,
    ...overrides,
  };
}

// A paged external response; the hook runs its actual reconciliation.
function makeOrdersQuery(result: { data: unknown; error: unknown }) {
  let afterId: string | null = null;
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => {
      afterId = null;
      return builder;
    }),
    gt: vi.fn((_column: string, value: string) => {
      afterId = value;
      return builder;
    }),
    limit: vi.fn((size: number) =>
      Promise.resolve({
        ...result,
        data: Array.isArray(result.data)
          ? (result.data as BoardOrder[])
              .filter((row) => afterId === null || row.id > afterId)
              .slice(0, size)
          : result.data,
      }),
    ),
  };
  return builder;
}

let pgCallback: ((payload: unknown) => void) | undefined;
let statusCallback: ((status: string) => void) | undefined;
const mockFrom = vi.fn();
const removeChannel = vi.fn();

function makeChannel() {
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, cb: typeof pgCallback) => {
      pgCallback = cb;
      return channel;
    }),
    subscribe: vi.fn((cb: typeof statusCallback) => {
      statusCallback = cb;
      return channel;
    }),
  };
  return channel;
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: mockFrom,
    channel: () => makeChannel(),
    removeChannel,
  }),
}));

beforeEach(() => {
  pgCallback = undefined;
  statusCallback = undefined;
  mockFrom.mockReset();
  removeChannel.mockReset();
});

describe("useRealtimeOrders", () => {
  it("does not subscribe when there are no booths, and keeps the initial orders", () => {
    const { result } = renderHook(() => useRealtimeOrders([], [order()]));
    expect(result.current.orders).toEqual([order()]);
    expect(result.current.status).toBe("connecting");
    expect(pgCallback).toBeUndefined();
    expect(statusCallback).toBeUndefined();
  });

  it("reports which booth each change touched, and null after a resync", async () => {
    mockFrom.mockReturnValue(makeOrdersQuery({ data: [], error: null }));
    const onChange = vi.fn();
    renderHook(() => useRealtimeOrders(["b1"], [], undefined, onChange));
    await act(async () => statusCallback?.("SUBSCRIBED"));
    expect(onChange).toHaveBeenLastCalledWith(null);
    act(() =>
      pgCallback?.({
        eventType: "INSERT",
        new: order({ booth_id: "b1" }),
        old: {},
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith("b1");
    act(() =>
      pgCallback?.({ eventType: "DELETE", new: {}, old: { id: "o1" } }),
    );
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("resyncs on the first SUBSCRIBED to recover orders placed during hydration", async () => {
    mockFrom.mockReturnValue(makeOrdersQuery({ data: [order()], error: null }));
    const { result } = renderHook(() => useRealtimeOrders(["b1"], []));
    act(() => statusCallback?.("SUBSCRIBED"));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    await waitFor(() => expect(result.current.orders).toEqual([order()]));
  });

  it("drops stale active orders absent from the reconnect snapshot", async () => {
    mockFrom.mockReturnValue(makeOrdersQuery({ data: [order()], error: null }));
    const { result } = renderHook(() => useRealtimeOrders(["b1"], [order()]));
    await act(async () => statusCallback?.("SUBSCRIBED"));
    mockFrom.mockReturnValue(makeOrdersQuery({ data: [], error: null }));
    act(() => statusCallback?.("CLOSED"));
    await act(async () => statusCallback?.("SUBSCRIBED"));
    expect(result.current.orders).toEqual([]);
  });

  it("continues from the last id when an earlier page order completes", async () => {
    const a = order({ id: "a" });
    const b = order({ id: "b" });
    const query = makeOrdersQuery({ data: [b], error: null });
    query.limit.mockResolvedValueOnce({ data: [a], error: null });
    mockFrom.mockReturnValue(query);
    const { result } = renderHook(() => useRealtimeOrders(["b1"], [a, b]));
    await act(async () => statusCallback?.("SUBSCRIBED"));
    expect(query.gt).toHaveBeenCalledWith("id", "a");
    expect(result.current.orders.map((row) => row.id)).toContain("b");
  });

  it("preserves realtime inserts that arrive while a snapshot is pending", async () => {
    let resolve!: (value: { data: BoardOrder[]; error: null }) => void;
    const query = makeOrdersQuery({ data: [], error: null });
    query.limit.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mockFrom.mockReturnValue(query);
    const { result } = renderHook(() => useRealtimeOrders(["b1"], []));
    act(() => statusCallback?.("SUBSCRIBED"));
    const inserted = order({ id: "o2" });
    act(() =>
      pgCallback?.({
        eventType: "INSERT",
        new: { ...inserted, access_token: "tok" },
        old: {},
      }),
    );
    await act(async () => resolve({ data: [], error: null }));
    expect(result.current.orders).toEqual([inserted]);
  });

  it("does not resurrect a realtime-deleted order from an in-flight snapshot", async () => {
    let resolve!: (value: { data: BoardOrder[]; error: null }) => void;
    const query = makeOrdersQuery({ data: [], error: null });
    query.limit.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mockFrom.mockReturnValue(query);
    const { result } = renderHook(() => useRealtimeOrders(["b1"], [order()]));
    act(() => statusCallback?.("SUBSCRIBED"));
    act(() =>
      pgCallback?.({ eventType: "DELETE", new: {}, old: { id: "o1" } }),
    );
    await act(async () => resolve({ data: [order()], error: null }));
    expect(result.current.orders).toEqual([]);
  });

  it("keeps an update to an order whose insertion was missed before subscribing", async () => {
    let resolve!: (value: { data: BoardOrder[]; error: null }) => void;
    const query = makeOrdersQuery({ data: [], error: null });
    query.limit.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mockFrom.mockReturnValue(query);
    const { result } = renderHook(() => useRealtimeOrders(["b1"], []));
    act(() => statusCallback?.("SUBSCRIBED"));
    const ready = order({
      status: "ready",
      updated_at: "2026-06-12T04:05:00Z",
    });
    act(() =>
      pgCallback?.({
        eventType: "UPDATE",
        new: { ...ready, access_token: "tok" },
        old: {},
      }),
    );
    await act(async () => resolve({ data: [order()], error: null }));
    expect(result.current.orders).toEqual([ready]);
  });

  it("applies a realtime INSERT and fires onInsert", async () => {
    const onInsert = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeOrders(["b1"], [], onInsert),
    );
    const inserted = order({ id: "o2" });
    act(() =>
      pgCallback?.({
        eventType: "INSERT",
        new: { ...inserted, access_token: "tok" },
        old: {},
      }),
    );
    await waitFor(() =>
      expect(result.current.orders.map((o) => o.id)).toEqual(["o2"]),
    );
    expect(onInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "o2" }),
    );
  });

  it("resyncs on a reconnect and keeps the newer of {local, snapshot} per id", async () => {
    // Local state already has a fresher update (e.g. an optimistic realtime
    // UPDATE) than what the resync snapshot returns — the merge must not
    // clobber it, per the hook's own documented invariant.
    const stale = order({ id: "o1", updated_at: "2026-06-12T04:00:00Z" });
    const fresh = order({
      id: "o1",
      status: "ready",
      updated_at: "2026-06-12T04:05:00Z",
    });
    mockFrom.mockReturnValue(
      makeOrdersQuery({
        data: [{ ...stale, access_token: "tok" }],
        error: null,
      }),
    );
    const { result } = renderHook(() => useRealtimeOrders(["b1"], [fresh]));

    // Initial connection and reconnect both reconcile.
    act(() => statusCallback?.("SUBSCRIBED"));
    await waitFor(() => expect(result.current.status).toBe("connected"));
    // Simulate a drop + reconnect: the second SUBSCRIBED triggers resync().
    act(() => statusCallback?.("CLOSED"));
    act(() => statusCallback?.("SUBSCRIBED"));

    await waitFor(() => expect(mockFrom).toHaveBeenCalled());
    await waitFor(() =>
      expect(result.current.orders.find((o) => o.id === "o1")?.status).toBe(
        "ready",
      ),
    );
  });

  it("marks disconnected on CHANNEL_ERROR", async () => {
    const { result } = renderHook(() => useRealtimeOrders(["b1"], []));
    act(() => statusCallback?.("CHANNEL_ERROR"));
    await waitFor(() => expect(result.current.status).toBe("disconnected"));
  });
});
