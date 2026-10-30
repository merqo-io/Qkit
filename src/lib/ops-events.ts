import type { IncidentKind } from "@merqo/ui/contracts";
import { createServiceClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all";
import { uuidSchema } from "@/lib/schemas";

export type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/** The kinds qkit writes; the 0108 check constraint allows only these. */
export type QkitIncidentKind = Extract<
  IncidentKind,
  "webhook_rejected" | "action_error"
>;

export type OpsEvent = {
  vendorId: string;
  kind: QkitIncidentKind;
  ref: string;
  code: string;
};

export type Incident = { kind: IncidentKind; count: number; lastAt: string };
export type RecentIncident = {
  kind: IncidentKind;
  ref: string;
  code: string;
  at: string;
};

const MAX_FIELD = 64;
const RECENT_CAP = 10;

function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err)
    return String((err as { code: unknown }).code);
  return err instanceof Error ? err.name : "unknown";
}

/** Append one failure row. Never throws. */
export async function recordOpsEvent(
  supabase: ServiceClient,
  e: OpsEvent,
): Promise<void> {
  try {
    const { error } = await supabase.from("ops_events").insert({
      vendor_id: e.vendorId,
      kind: e.kind,
      ref: e.ref.slice(0, MAX_FIELD),
      code: e.code.slice(0, MAX_FIELD),
    });
    if (error) console.error("ops_events insert failed", errorCode(error));
  } catch (err) {
    console.error("ops_events insert failed", errorCode(err));
  }
}

async function vendorForOrder(
  supabase: ServiceClient,
  orderId: string,
): Promise<string | null> {
  const { data: order } = await supabase
    .from("orders")
    .select("booth_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;
  const { data: booth } = await supabase
    .from("booths")
    .select("vendor_id")
    .eq("id", order.booth_id)
    .maybeSingle();
  return booth?.vendor_id ?? null;
}

/**
 * Records a failure about one order against the vendor that owns its booth,
 * read from qkit's own tables. Nothing is recorded when the ref is not a
 * known order. Never throws.
 */
export async function recordOrderIncident(
  kind: QkitIncidentKind,
  orderId: string,
  code: string,
): Promise<void> {
  if (!uuidSchema.safeParse(orderId).success) return;
  try {
    const supabase = await createServiceClient();
    const vendorId = await vendorForOrder(supabase, orderId);
    if (!vendorId) return;
    await recordOpsEvent(supabase, { vendorId, kind, ref: orderId, code });
  } catch (err) {
    console.error("ops_events insert failed", errorCode(err));
  }
}

/**
 * Incidents for one vendor in the last `sinceHours`: counts per kind (most
 * frequent first) and the newest 10 rows. Null when the read fails.
 */
export async function summarizeIncidents(
  supabase: ServiceClient,
  vendorId: string,
  sinceHours = 72,
): Promise<{ incidents: Incident[]; recent: RecentIncident[] } | null> {
  const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
  let rows: {
    kind: IncidentKind;
    ref: string;
    code: string;
    created_at: string;
  }[];
  try {
    rows = await readAllRows((from, to) =>
      supabase
        .from("ops_events")
        .select("kind, ref, code, created_at")
        .eq("vendor_id", vendorId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    );
  } catch {
    return null;
  }

  const byKind = new Map<IncidentKind, Incident>();
  for (const row of rows) {
    const seen = byKind.get(row.kind);
    if (seen) seen.count += 1;
    else
      byKind.set(row.kind, {
        kind: row.kind,
        count: 1,
        lastAt: row.created_at,
      });
  }

  return {
    incidents: [...byKind.values()].sort((a, b) => b.count - a.count),
    recent: rows.slice(0, RECENT_CAP).map((r) => ({
      kind: r.kind,
      ref: r.ref,
      code: r.code,
      at: r.created_at,
    })),
  };
}
