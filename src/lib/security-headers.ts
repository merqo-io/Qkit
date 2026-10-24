import type { CspOptions } from "@merqo/ui/security";

const SUPABASE = ["https://*.supabase.co"];
const GOOGLE_AVATARS = "https://*.googleusercontent.com";

// The configured project origin too, so a local stack (http://127.0.0.1:54321) works in a production build.
function configuredSupabase(): { http: string[]; ws: string[] } {
  try {
    const { origin } = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return { http: [origin], ws: [origin.replace(/^http/, "ws")] };
  } catch {
    return { http: [], ws: [] };
  }
}

export function cspOptions(isDev: boolean): Omit<CspOptions, "nonce"> {
  const configured = configuredSupabase();
  return {
    isDev,
    connectSrc: [
      ...SUPABASE,
      "wss://*.supabase.co",
      ...configured.http,
      ...configured.ws,
    ],
    imgSrc: [...SUPABASE, GOOGLE_AVATARS, ...configured.http],
  };
}
