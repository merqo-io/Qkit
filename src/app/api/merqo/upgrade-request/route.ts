import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  bearerOk,
  listAllAuthUsers,
  findAuthUserByEmail,
} from "@/lib/merqo/auth";
import { resolveUpgradeOutcome } from "@/lib/merqo/upgrade-request";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const revalidate = 0;

const bodySchema = z.object({ email: z.email() });

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

  const usersRes = await listAllAuthUsers(supabase, "merqo upgrade-request");
  if (usersRes.error) {
    console.error("merqo upgrade-request: read failed", usersRes.error.message);
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const authUser = findAuthUserByEmail(
    usersRes.data?.users ?? [],
    parsed.data.email,
  );

  const vendorRes = authUser
    ? await supabase
        .from("vendors")
        .select("id")
        .eq("id", authUser.id)
        .maybeSingle()
    : null;
  if (vendorRes?.error) {
    console.error(
      "merqo upgrade-request: read failed",
      vendorRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const vendorId = vendorRes?.data?.id ?? null;

  const pendingRes = vendorId
    ? await supabase
        .from("purchase_requests")
        .select("id")
        .eq("vendor_id", vendorId)
        .eq("kind", "monthly")
        .eq("status", "pending")
        .limit(1)
        .maybeSingle()
    : null;
  if (pendingRes?.error) {
    console.error(
      "merqo upgrade-request: read failed",
      pendingRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const outcome = resolveUpgradeOutcome(vendorId !== null, !!pendingRes?.data);

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
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true });
}
