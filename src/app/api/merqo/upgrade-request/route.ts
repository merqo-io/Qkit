import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { bearerOk } from "@/lib/merqo/auth";
import { findVendorByEmail } from "@/lib/merqo/vendor-lookup";
import { resolveUpgradeOutcome } from "@/lib/merqo/upgrade-request";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const revalidate = 0;

function upstreamUnavailable() {
  return NextResponse.json(
    { success: false, error: "Upstream unavailable" },
    { status: 503 },
  );
}

const bodySchema = z.object({ email: z.email() });

async function hasPendingRequest(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  vendorId: string,
): Promise<boolean | "error"> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("kind", "monthly")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("merqo upgrade-request: read failed", error.message);
    return "error";
  }
  return Boolean(data);
}

export async function POST(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();

  // Defense-in-depth against a leaked bearer secret -- the secret itself is
  // the real gate, this just blunts abuse once compromised. Tighter than a
  // read-only endpoint since this one creates a purchase request.
  const allowed = await rateLimit(
    `merqo-upgrade-request:${clientIp(request.headers)}`,
    10,
    60,
  );
  if (!allowed)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const lookup = await findVendorByEmail(
    supabase,
    "merqo upgrade-request",
    parsed.data.email,
  );
  if (!lookup.ok) return upstreamUnavailable();
  const vendorId = lookup.vendor?.id ?? null;

  const pending =
    vendorId === null ? false : await hasPendingRequest(supabase, vendorId);
  if (pending === "error") return upstreamUnavailable();

  const outcome = resolveUpgradeOutcome(vendorId !== null, pending);

  if (outcome === "not_found") {
    return NextResponse.json(
      { success: false, error: "No matching vendor" },
      { status: 404 },
    );
  }
  if (outcome === "already_pending") {
    return NextResponse.json({ success: true });
  }

  if (vendorId === null) {
    return NextResponse.json(
      { success: false, error: "No matching vendor" },
      { status: 404 },
    );
  }

  const insertRes = await supabase
    .from("purchase_requests")
    .insert({ vendor_id: vendorId, kind: "monthly" });
  if (insertRes.error) {
    console.error(
      "merqo upgrade-request: insert failed",
      insertRes.error.message,
    );
    return upstreamUnavailable();
  }

  return NextResponse.json({ success: true });
}
