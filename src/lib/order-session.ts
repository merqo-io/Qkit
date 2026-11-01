import { cookies } from "next/headers";
import { uuidSchema } from "@/lib/schemas";

const COOKIE = "qkit_order_sid";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Opaque per-browser id for the order rate limiter. Minted by the server
 * (the per-IP cap bounds clients that forge or drop it).
 * Venue Wi-Fi puts many customers behind one IP; this keeps them apart.
 */
export async function orderSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (uuidSchema.safeParse(existing).success) return existing as string;
  const sid = crypto.randomUUID();
  store.set(COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return sid;
}
