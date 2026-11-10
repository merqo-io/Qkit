import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { drainProofDeletions } from "@/lib/proof-storage-cleanup";

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The comparison is
// constant-time and fails closed when the secret is unset, so a missing env
// var can never open the route.
function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

// Order deletions that happen outside qkit (account or vendor cascades, manual
// deletes) queue screenshot paths that only deleteBooth drains. This sweeps the
// rest. drainProofDeletions never throws and reports counts, so any failed
// removal or queue error returns 500 and shows up in Vercel's cron logs.
export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await drainProofDeletions();
    const healthy = result.ok && result.failed === 0;
    return NextResponse.json(result, { status: healthy ? 200 : 500 });
  } catch (error) {
    console.error("proof storage drain cron failed", error);
    return NextResponse.json({ error: "Drain failed" }, { status: 500 });
  }
}
