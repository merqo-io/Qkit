import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { BrowserContext } from "@playwright/test";
import { totpCode } from "./totp";

// The vendor that owns the seeded "Kopitiam Cart" booth
// (supabase/seed/coffee-cart.sql; created in CI by ci-auth-bootstrap.sql).
export const SEED_VENDOR_ID = "6df824a1-9da2-4608-ad13-2400a9114ec0";

// The seeds give this user no password, and locally it can be a developer's
// real account, so the spec never sets one. It mints a magic-link token with
// the service-role key instead, redeems it for a session, and hands the
// browser the same auth cookies @supabase/ssr would have written at login.
function localSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) {
    throw new Error(
      "Vendor e2e needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY for the local stack (see e2e/README.md)",
    );
  }
  // Signs a user in and writes to their vendor row, so never against a
  // hosted project.
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Vendor e2e refuses a non-local Supabase (${host})`);
  }
  return { url, publishableKey, secretKey };
}

/**
 * Signs `context` in as the seed booth's vendor, past the dashboard's gates.
 * With `asAdmin` the vendor also becomes an admin and clears a TOTP challenge,
 * so /admin (which needs `aal2`) opens.
 */
export async function signInSeedVendor(
  context: BrowserContext,
  baseURL: string,
  { asAdmin = false }: { asAdmin?: boolean } = {},
): Promise<void> {
  const env = localSupabaseEnv();
  const admin = createClient(env.url, env.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: found, error: findError } =
    await admin.auth.admin.getUserById(SEED_VENDOR_ID);
  const email = found.user?.email;
  if (findError || !email) {
    throw new Error(
      `Seed vendor ${SEED_VENDOR_ID} not found; apply the coffee-cart seed`,
    );
  }

  // The legal gate asks merqo, which e2e cannot reach, and fails closed; a
  // fresh cached "current" answer lets the dashboard through. Marking both
  // tours seen keeps their overlay off the board.
  const now = new Date().toISOString();
  const qkit = admin.schema("qkit");
  const { error: legalError } = await qkit
    .from("legal_check_state")
    .upsert({ email: email.toLowerCase(), checked_at: now, is_current: true });
  if (legalError) throw new Error(`legal_check_state: ${legalError.message}`);
  const { error: tourError } = await qkit
    .from("vendors")
    .update({ tours_seen: { orders: now, booths: now } })
    .eq("id", SEED_VENDOR_ID);
  if (tourError) throw new Error(`vendors.tours_seen: ${tourError.message}`);

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) throw new Error(`generateLink: ${linkError.message}`);

  // Later writes win: the TOTP upgrade re-issues the same cookie names.
  const cookies = new Map<string, string>();
  const ssr = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => [],
      setAll: (set) => {
        for (const { name, value } of set) cookies.set(name, value);
      },
    },
  });
  const { error: otpError } = await ssr.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (otpError) throw new Error(`verifyOtp: ${otpError.message}`);
  if (asAdmin) {
    const { error: adminError } = await qkit
      .from("admins")
      .upsert({ user_id: SEED_VENDOR_ID });
    if (adminError) throw new Error(`admins: ${adminError.message}`);
    const { data: factor, error: enrolError } = await ssr.auth.mfa.enroll({
      factorType: "totp",
    });
    if (enrolError || !factor) throw new Error("mfa enroll failed");
    const { error: verifyError } = await ssr.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: totpCode(factor.totp.secret),
    });
    if (verifyError) throw new Error(`mfa verify: ${verifyError.message}`);
  }
  const live = [...cookies].filter(([, value]) => value !== "");
  if (live.length === 0) throw new Error("Sign-in wrote no auth cookie");

  await context.addCookies(
    live.map(([name, value]) => ({ name, value, url: baseURL })),
  );
}
