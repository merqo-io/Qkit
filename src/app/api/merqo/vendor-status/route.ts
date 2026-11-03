import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  bearerOk,
  findAuthUserByEmail,
  listAllAuthUsers,
} from "@/lib/merqo/auth";
import { resolveVendorStatus } from "@/lib/merqo/vendor-status";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { resolveEntitlement, storedFromRow } from "@/lib/plan";

export const revalidate = 0;

const querySchema = z.object({ email: z.email() });

async function readVendorRows(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  id: string,
) {
  const [vendor, entitlement] = await Promise.all([
    supabase.from("vendors").select("id").eq("id", id).maybeSingle(),
    supabase
      .from("vendor_entitlements")
      .select(
        "tier, founder, stats_window, event_pass_starts_at, event_pass_ends_at, valid_until",
      )
      .eq("vendor_id", id)
      .maybeSingle(),
  ]);
  return {
    vendor: vendor.data,
    entitlement: entitlement.data,
    error: vendor.error?.message ?? entitlement.error?.message ?? null,
  };
}

async function lookupStatus(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  email: string,
) {
  const usersRes = await listAllAuthUsers(supabase, "merqo vendor-status");
  if (usersRes.error) {
    console.error("merqo vendor-status: read failed", usersRes.error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const user = findAuthUserByEmail(usersRes.data?.users ?? [], email);
  const rows = user ? await readVendorRows(supabase, user.id) : null;
  if (rows?.error) {
    console.error("merqo vendor-status: read failed", rows.error);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const stored = rows?.entitlement ? storedFromRow(rows.entitlement) : null;

  const status = resolveVendorStatus(
    email,
    (usersRes.data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? null,
    })),
    rows?.vendor ? [rows.vendor] : [],
    () => resolveEntitlement(stored, Date.now()).tier,
  );

  return NextResponse.json(status);
}

export async function GET(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    email: searchParams.get("email") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  // Defense-in-depth against a leaked bearer secret -- the secret itself is
  // the real gate, this just blunts enumeration/DoS once compromised.
  const allowed = await rateLimit(
    `merqo-vendor-status:${clientIp(request.headers)}`,
    30,
    60,
  );
  if (!allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  return lookupStatus(supabase, parsed.data.email);
}
