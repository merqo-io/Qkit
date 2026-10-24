import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  bearerOk,
  listAllAuthUsers,
  findAuthUserByEmail,
} from "@/lib/merqo/auth";
import { resolveDowngradeOutcome } from "@/lib/merqo/downgrade-request";
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
  // read-only endpoint since this one mutates a vendor's plan.
  const allowed = await rateLimit(
    `merqo-downgrade-request:${clientIp(request.headers)}`,
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

  const usersRes = await listAllAuthUsers(supabase, "merqo downgrade-request");
  if (usersRes.error) {
    console.error(
      "merqo downgrade-request: read failed",
      usersRes.error.message,
    );
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
        .select("id, plan")
        .eq("id", authUser.id)
        .maybeSingle()
    : null;
  if (vendorRes?.error) {
    console.error(
      "merqo downgrade-request: read failed",
      vendorRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }
  const vendorId = vendorRes?.data?.id ?? null;
  const currentPlan = vendorRes?.data?.plan ?? "free";

  const outcome = resolveDowngradeOutcome(vendorId !== null, currentPlan);

  if (outcome === "not_found") {
    return NextResponse.json(
      { success: false, error: "No matching vendor" },
      { status: 404 },
    );
  }
  if (outcome === "already_free") {
    return NextResponse.json({ success: true });
  }

  if (vendorId === null) {
    return NextResponse.json(
      { success: false, error: "No matching vendor" },
      { status: 404 },
    );
  }

  const updateRes = await supabase
    .from("vendors")
    .update({ plan: "free" })
    .eq("id", vendorId);
  if (updateRes.error) {
    console.error(
      "merqo downgrade-request: update failed",
      updateRes.error.message,
    );
    return NextResponse.json(
      { success: false, error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  // Clear any stale pending monthly request — best-effort, does not fail
  // the downgrade (the plan flip is the operation that matters).
  const clearRes = await supabase
    .from("purchase_requests")
    .update({ status: "resolved" })
    .eq("vendor_id", vendorId)
    .eq("kind", "monthly")
    .eq("status", "pending");
  if (clearRes.error) {
    console.error(
      "merqo downgrade-request: clearing pending requests failed",
      clearRes.error.message,
    );
  }

  return NextResponse.json({ success: true });
}
