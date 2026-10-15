import { describe, expect, it, vi, beforeEach } from "vitest";
import { getBoothQueueDisplay } from "./actions";

const { rateLimitMock } = vi.hoisted(() => ({ rateLimitMock: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "127.0.0.1",
  rateLimit: rateLimitMock,
}));

// Chainable stub: every builder method returns itself; the chain is
// awaitable directly (the final orders read never calls a terminal
// .maybeSingle()) and .maybeSingle() also resolves the same result for the
// single-row lookups.
function chain(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {};
  let afterId: string | null = null;
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.gte = self;
  obj.not = self;
  obj.or = self;
  obj.order = self;
  obj.gt = (_column: string, id: string) => {
    afterId = id;
    return obj;
  };
  obj.limit = (limit: number) => {
    if (limit !== 1000) return obj;
    if (!Array.isArray(result.data)) return Promise.resolve(result);
    const rows = result.data
      .map((row, index) => ({
        ...row,
        id: row.id ?? `fixture-${String(index).padStart(6, "0")}`,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return Promise.resolve({
      ...result,
      data: rows
        .filter((row) => afterId === null || row.id > afterId)
        .slice(0, 2),
    });
  };
  obj.range = (from: number, to: number) =>
    Promise.resolve({
      ...result,
      data: Array.isArray(result.data)
        ? result.data.slice(from, Math.min(to + 1, from + 2))
        : result.data,
    });
  obj.maybeSingle = () => Promise.resolve(result);
  obj.then = (resolve: (v: typeof result) => void) =>
    Promise.resolve(result).then(resolve);
  return obj;
}

const { createServiceClientMock, fromMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  return {
    createServiceClientMock: vi.fn(
      (): Promise<{ from: (...args: unknown[]) => unknown }> =>
        Promise.resolve({ from: fromMock }),
    ),
    fromMock,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));

const BOOTH = "00000000-0000-4000-8000-000000000001";
// Relative to now: an order older than STALE_ORDER_VIEW_HOURS is left off the
// display, so a fixed date would age out of every test below.
const PLACED_FIRST = new Date(Date.now() - 10 * 60_000).toISOString();
const PLACED_SECOND = new Date(Date.now() - 5 * 60_000).toISOString();
const VENDOR = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  createServiceClientMock.mockClear();
  fromMock.mockReset();
  rateLimitMock.mockReset().mockResolvedValue(true);
});

describe("getBoothQueueDisplay", () => {
  it("includes the third queued order beyond a two-row API cap", async () => {
    const active = [1, 2, 3].map((n) => ({
      order_number: String(n).padStart(4, "0"),
      status: "preparing",
      created_at: new Date(Date.now() - (4 - n) * 60_000).toISOString(),
      priority_bumped_at: null,
    }));
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }));
    expect(
      (await getBoothQueueDisplay(BOOTH))?.map((o) => o.orderNumber),
    ).toEqual(["0001", "0002", "0003"]);
  });

  it("retains the prior display on a late queue-page failure", async () => {
    const query = chain({ data: [], error: null });
    query.limit = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            order_number: "0001",
            status: "ready",
            created_at: PLACED_FIRST,
            priority_bumped_at: null,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(query);
    expect(await getBoothQueueDisplay(BOOTH)).toBeNull();
  });

  it("rejects invalid booth identifiers before accessing the database", async () => {
    expect(await getBoothQueueDisplay("invalid")).toBeNull();
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("does not read queue history when rate limited", async () => {
    rateLimitMock.mockResolvedValue(false);
    expect(await getBoothQueueDisplay(BOOTH)).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
  it("returns null when the booth doesn't exist", async () => {
    fromMock.mockReturnValueOnce(chain({ data: null, error: null }));
    const res = await getBoothQueueDisplay(BOOTH);
    expect(res).toBeNull();
  });

  it("returns null and logs on a booth read error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fromMock.mockReturnValueOnce(
      chain({ data: null, error: { message: "boom" } }),
    );
    const res = await getBoothQueueDisplay(BOOTH);
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "getBoothQueueDisplay: booth read failed",
      "boom",
    );
    errorSpy.mockRestore();
  });

  it("returns active orders sorted oldest-first, real order_number by default", async () => {
    const active = [
      {
        order_number: "0002",
        status: "preparing",
        created_at: PLACED_SECOND,
        priority_bumped_at: null,
      },
      {
        order_number: "0001",
        status: "ready",
        created_at: PLACED_FIRST,
        priority_bumped_at: null,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null })) // booth
      .mockReturnValueOnce(chain({ data: null, error: null })) // vendor (no reset setting)
      .mockReturnValueOnce(chain({ data: active, error: null })); // orders

    const res = await getBoothQueueDisplay(BOOTH);
    expect(res).toEqual([
      { orderNumber: "0001", displayNumber: "0001", status: "ready" },
      { orderNumber: "0002", displayNumber: "0002", status: "preparing" },
    ]);
  });

  it("computes daily-reset display numbers when the vendor has it enabled", async () => {
    const active = [
      {
        order_number: "0105",
        status: "ready",
        created_at: PLACED_FIRST,
        priority_bumped_at: null,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null })) // booth
      .mockReturnValueOnce(
        chain({
          data: {
            board_settings: {
              aging_min: 5,
              overdue_min: 10,
              sound_id: "chime",
              desktop_notify: false,
              undo_seconds: 5,
              daily_order_number_reset: true,
              show_wait_estimate: true,
              default_prep_minutes: null,
              ready_auto_clear_min: null,
            },
          },
          error: null,
        }),
      ) // vendor
      .mockReturnValueOnce(
        chain({ data: { order_number: "0100" }, error: null }),
      ) // first-today baseline
      .mockReturnValueOnce(chain({ data: active, error: null })); // orders

    const res = await getBoothQueueDisplay(BOOTH);
    expect(res).toEqual([
      { orderNumber: "0105", status: "ready", displayNumber: "006" },
    ]);
  });

  it("keeps a just-auto-cleared number on the screen, shown as ready", async () => {
    // ready_auto_clear_min marks an order collected whether or not anyone
    // picked it up, so dropping it immediately can blank a number while the cup
    // is still on the shelf.
    const active = [
      {
        order_number: "0001",
        status: "completed",
        created_at: PLACED_FIRST,
        priority_bumped_at: null,
        completed_at: new Date(Date.now() - 60_000).toISOString(),
        auto_completed: true,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }));

    const res = await getBoothQueueDisplay(BOOTH);
    expect(res).toEqual([
      { orderNumber: "0001", displayNumber: "0001", status: "ready" },
    ]);
  });

  it("drops a number marked picked up at once, with no grace window", async () => {
    // "Mark Picked Up" (or the customer's own pickup scan) means the customer
    // has the order; only an auto-cleared one might still be on the shelf.
    const active = [
      {
        order_number: "0001",
        status: "completed",
        created_at: PLACED_FIRST,
        priority_bumped_at: null,
        completed_at: new Date(Date.now() - 10_000).toISOString(),
        auto_completed: false,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }));

    expect(await getBoothQueueDisplay(BOOTH)).toEqual([]);
  });

  it("drops an auto-cleared number once its grace window has passed", async () => {
    const active = [
      {
        order_number: "0001",
        status: "completed",
        created_at: PLACED_FIRST,
        priority_bumped_at: null,
        completed_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        auto_completed: true,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }));

    expect(await getBoothQueueDisplay(BOOTH)).toEqual([]);
  });

  it("drops a collected order with no completed_at rather than pinning it up", async () => {
    const active = [
      {
        order_number: "0001",
        status: "completed",
        created_at: PLACED_FIRST,
        priority_bumped_at: null,
        completed_at: null,
        auto_completed: true,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }));

    expect(await getBoothQueueDisplay(BOOTH)).toEqual([]);
  });

  it("puts a priority-bumped order first even if it's newer", async () => {
    const active = [
      {
        order_number: "0001",
        status: "preparing",
        created_at: PLACED_FIRST,
        priority_bumped_at: null,
      },
      {
        order_number: "0002",
        status: "preparing",
        created_at: PLACED_SECOND,
        priority_bumped_at: "2026-06-12T10:06:00Z",
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }));

    const res = await getBoothQueueDisplay(BOOTH);
    expect(res?.map((o) => o.orderNumber)).toEqual(["0002", "0001"]);
  });

  it("orders the ready group by ready time, most recently readied first", async () => {
    const minsAgo = (m: number) =>
      new Date(Date.now() - m * 60_000).toISOString();
    const active = [
      {
        order_number: "0001",
        status: "ready",
        created_at: minsAgo(30),
        priority_bumped_at: null,
        ready_at: minsAgo(2),
      },
      {
        order_number: "0002",
        status: "completed",
        created_at: minsAgo(25),
        priority_bumped_at: null,
        ready_at: minsAgo(6),
        completed_at: minsAgo(1),
        auto_completed: true,
      },
      {
        order_number: "0003",
        status: "ready",
        created_at: minsAgo(20),
        priority_bumped_at: "2026-06-12T10:06:00Z",
        ready_at: minsAgo(4),
      },
      {
        order_number: "0004",
        status: "ready",
        created_at: minsAgo(15),
        priority_bumped_at: null,
        ready_at: minsAgo(1),
      },
      {
        order_number: "0005",
        status: "preparing",
        created_at: minsAgo(10),
        priority_bumped_at: null,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: active, error: null }));

    const res = await getBoothQueueDisplay(BOOTH);
    expect(
      res?.filter((o) => o.status === "ready").map((o) => o.orderNumber),
    ).toEqual(["0004", "0001", "0003", "0002"]);
  });

  it("selects only the columns the screen needs, plus ready_at and auto_completed", async () => {
    const selectSpy = vi.fn();
    const query = chain({ data: [], error: null });
    query.select = (cols: string) => {
      selectSpy(cols);
      return query;
    };
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(query);

    await getBoothQueueDisplay(BOOTH);
    const cols = String(selectSpy.mock.calls[0]?.[0])
      .split(",")
      .map((c) => c.trim())
      .sort();
    expect(cols).toEqual([
      "auto_completed",
      "completed_at",
      "created_at",
      "id",
      "order_number",
      "priority_bumped_at",
      "ready_at",
      "status",
    ]);
  });

  it("returns null and logs on an orders read error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: { message: "boom" } }));

    const res = await getBoothQueueDisplay(BOOTH);
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "getBoothQueueDisplay: orders read failed",
      "Could not load complete query results",
    );
    errorSpy.mockRestore();
  });

  it("excludes a pending-payment QR order from the result", async () => {
    const orSpy = vi.fn();
    function chainWithOrSpy(result: { data: unknown; error: unknown }) {
      const obj = chain(result);
      const self = () => obj;
      obj.select = self;
      obj.eq = self;
      obj.gte = self;
      obj.not = self;
      obj.or = (arg: string) => {
        orSpy(arg);
        return obj;
      };
      obj.order = self;
      obj.maybeSingle = () => Promise.resolve(result);
      obj.then = (resolve: (v: typeof result) => void) =>
        Promise.resolve(result).then(resolve);
      return obj;
    }

    const active = [
      {
        order_number: "0001",
        status: "preparing" as const,
        created_at: PLACED_FIRST,
        priority_bumped_at: null,
      },
    ];
    fromMock
      .mockReturnValueOnce(
        chainWithOrSpy({ data: { vendor_id: VENDOR }, error: null }),
      )
      .mockReturnValueOnce(chainWithOrSpy({ data: null, error: null }))
      .mockReturnValueOnce(chainWithOrSpy({ data: active, error: null }));

    const res = await getBoothQueueDisplay(BOOTH);
    expect(orSpy).toHaveBeenCalledWith(
      "payment_status.neq.pending,source.neq.qr",
    );
    expect(orSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^status\.in\.\(pending,confirmed,preparing,ready\),and\(status\.eq\.completed,completed_at\.gte\./,
      ),
    );
    expect(orSpy).toHaveBeenCalledWith(
      expect.stringMatching(/,auto_completed\.is\.true\)$/),
    );
    expect(res?.map((o) => o.orderNumber)).toEqual(["0001"]);
  });
});

describe("getBoothQueueDisplay stale orders", () => {
  it("leaves an order from an earlier day off the public screen", async () => {
    const rows = [
      {
        order_number: "0022",
        status: "preparing",
        created_at: new Date(Date.now() - 8 * 24 * 60 * 60_000).toISOString(),
        priority_bumped_at: null,
      },
      {
        order_number: "0031",
        status: "preparing",
        created_at: PLACED_FIRST,
        priority_bumped_at: null,
      },
    ];
    fromMock
      .mockReturnValueOnce(chain({ data: { vendor_id: VENDOR }, error: null }))
      .mockReturnValueOnce(chain({ data: null, error: null }))
      .mockReturnValueOnce(chain({ data: rows, error: null }));

    expect(await getBoothQueueDisplay(BOOTH)).toEqual([
      { orderNumber: "0031", displayNumber: "0031", status: "preparing" },
    ]);
  });
});
