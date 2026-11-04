import { NextResponse } from "next/server";
import type { z } from "zod";
import type { Tier } from "@/lib/plan";
import { createServiceClient } from "@/lib/supabase/server";
import {
  findAuthUserByEmail,
  listAllAuthUsers,
  provisionBearerOk,
} from "@/lib/merqo/auth";
import { entitlementPayloadSchema } from "@/lib/merqo/entitlement-contract";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const revalidate = 0;

type StorablePayload = Omit<
  z.infer<typeof entitlementPayloadSchema>,
  "tier"
> & { tier: Tier };

type ParsedBody = { payload: StorablePayload } | { response: NextResponse };

function reject(error: string): { response: NextResponse } {
  return { response: NextResponse.json({ error }, { status: 400 }) };
}

async function parseBody(request: Request): Promise<ParsedBody> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return reject("Invalid JSON body");
  }
  const parsed = entitlementPayloadSchema.safeParse(json);
  if (!parsed.success) return reject("Invalid payload");
  const payload = parsed.data;
  if (payload.kit !== "qkit") return reject("Wrong kit");
  // The contract's refine already rejects "paid" for qkit; this narrows the
  // type for the cache column without a cast.
  if (payload.tier === "paid") return reject("Invalid payload");
  return { payload: { ...payload, tier: payload.tier } };
}

export async function POST(request: Request) {
  if (!provisionBearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();

  // Defense-in-depth against a leaked bearer secret; the secret itself is the
  // real gate. Looser than vendor-provision because merqo re-pushes every
  // affected vendor in a burst after a plan change or a backfill.
  const allowed = await rateLimit(
    `merqo-entitlement:${clientIp(request.headers)}`,
    120,
    60,
  );
  if (!allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await parseBody(request);
  if ("response" in body) return body.response;
  const payload = body.payload;

  const usersRes = await listAllAuthUsers(supabase, "merqo entitlement");
  if (usersRes.error) {
    console.error("merqo entitlement: read failed", usersRes.error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const user = findAuthUserByEmail(usersRes.data?.users ?? [], payload.email);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unknown_vendor" },
      { status: 404 },
    );
  }

  // The SQL function applies the issued_at ordering atomically; a stale push
  // returns false and is still a success for the sender.
  const { error } = await supabase.rpc("apply_vendor_entitlement", {
    p_vendor: user.id,
    p_tier: payload.tier,
    p_founder: payload.founder,
    p_stats_window: payload.stats_window,
    p_event_pass_starts_at: payload.event_pass?.starts_at ?? null,
    p_event_pass_ends_at: payload.event_pass?.ends_at ?? null,
    p_valid_until: payload.valid_until,
    p_issued_at: payload.issued_at,
  });
  if (error) {
    console.error("merqo entitlement: write failed", error.message);
    return NextResponse.json({ error: "Could not store" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
