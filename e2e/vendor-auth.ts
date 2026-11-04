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

function serviceClient(env: ReturnType<typeof localSupabaseEnv>) {
  return createClient(env.url, env.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type Admin = ReturnType<typeof serviceClient>;

/**
 * Redeems a magic link for `email` and returns the auth cookies
 * `@supabase/ssr` would have written. With `mfa` it first enrols and verifies
 * a TOTP factor, so the session reaches `aal2`.
 */
async function sessionCookies(
  env: ReturnType<typeof localSupabaseEnv>,
  admin: Admin,
  user: { email: string; id: string },
  { mfa }: { mfa: boolean },
): Promise<[string, string][]> {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
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
  if (mfa) {
    // A retry finds the factor of the last attempt, and a new one needs aal2.
    const { data: existing } = await admin.auth.admin.mfa.listFactors({
      userId: user.id,
    });
    for (const old of existing?.factors ?? []) {
      await admin.auth.admin.mfa.deleteFactor({ id: old.id, userId: user.id });
    }
    const { data: factor, error: enrolError } = await ssr.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `e2e-${Date.now()}`,
    });
    if (enrolError || !factor) {
      throw new Error(`mfa enroll: ${enrolError?.message ?? "no factor"}`);
    }
    const { error: verifyError } = await ssr.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: totpCode(factor.totp.secret),
    });
    if (verifyError) throw new Error(`mfa verify: ${verifyError.message}`);
  }
  const live = [...cookies].filter(([, value]) => value !== "");
  if (live.length === 0) throw new Error("Sign-in wrote no auth cookie");
  return live;
}

type VendorIdentity = { email: string; id: string };

// The legal gate asks merqo, which e2e cannot reach, and fails closed; a fresh
// cached "current" answer lets the dashboard through. Marking both tours seen
// keeps their overlay off the board.
async function signInVendor(
  { env, admin }: { env: ReturnType<typeof localSupabaseEnv>; admin: Admin },
  context: BrowserContext,
  baseURL: string,
  vendor: VendorIdentity,
): Promise<void> {
  const now = new Date().toISOString();
  const qkit = admin.schema("qkit");
  const { error: legalError } = await qkit.from("legal_check_state").upsert({
    email: vendor.email.toLowerCase(),
    checked_at: now,
    is_current: true,
  });
  if (legalError) throw new Error(`legal_check_state: ${legalError.message}`);
  const { error: tourError } = await qkit
    .from("vendors")
    .update({ tours_seen: { orders: now, booths: now } })
    .eq("id", vendor.id);
  if (tourError) throw new Error(`vendors.tours_seen: ${tourError.message}`);

  const cookies = await sessionCookies(env, admin, vendor, { mfa: false });
  await context.addCookies(
    cookies.map(([name, value]) => ({ name, value, url: baseURL })),
  );
}

/** Signs `context` in as the seed booth's vendor, past the dashboard's gates. */
export async function signInSeedVendor(
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  const env = localSupabaseEnv();
  const admin = serviceClient(env);

  const { data: found, error: findError } =
    await admin.auth.admin.getUserById(SEED_VENDOR_ID);
  const email = found.user?.email;
  if (findError || !email) {
    throw new Error(
      `Seed vendor ${SEED_VENDOR_ID} not found; apply the coffee-cart seed`,
    );
  }
  await signInVendor({ env, admin }, context, baseURL, {
    email,
    id: SEED_VENDOR_ID,
  });
}

const FREE_VENDOR_EMAIL = "e2e-free@qkit.test";
const FREE_BOOTH_ID = "c0ffee02-0000-4000-8000-000000000001";

/**
 * Signs `context` in as a dedicated free-tier vendor with exactly one booth.
 * The seed vendor holds the qkit tier (the order specs need counter ops), so
 * the free plan's one-booth cap needs its own vendor; creating it here keeps
 * local runs working without an extra seed, and never touches the seed
 * vendor's entitlement.
 */
export async function signInFreeVendor(
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  const env = localSupabaseEnv();
  const admin = serviceClient(env);

  const created = await admin.auth.admin.createUser({
    email: FREE_VENDOR_EMAIL,
    email_confirm: true,
  });
  let id = created.data.user?.id;
  if (!id) {
    const { data: list, error: listError } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listError) throw new Error(`listUsers: ${listError.message}`);
    id = list.users.find((u) => u.email === FREE_VENDOR_EMAIL)?.id;
  }
  if (!id) throw new Error("Could not create or find the e2e free vendor");

  const qkit = admin.schema("qkit");
  const { error: vendorError } = await qkit
    .from("vendors")
    .upsert({ id }, { onConflict: "id", ignoreDuplicates: true });
  if (vendorError) throw new Error(`vendors: ${vendorError.message}`);
  const { error: boothError } = await qkit.from("booths").upsert(
    {
      id: FREE_BOOTH_ID,
      vendor_id: id,
      name: "Free Test Cart",
      is_active: true,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (boothError) throw new Error(`booths: ${boothError.message}`);

  await signInVendor({ env, admin }, context, baseURL, {
    email: FREE_VENDOR_EMAIL,
    id,
  });
}

const ADMIN_EMAIL = "e2e-admin@qkit.test";

/**
 * Signs `context` in as a dedicated admin (not the seed vendor, whose
 * dashboard other specs use in parallel). With `mfa` the session clears a
 * TOTP challenge, so /admin (which needs `aal2`) opens; without it the
 * session stays at `aal1`.
 */
export async function signInSeedAdmin(
  context: BrowserContext,
  baseURL: string,
  { mfa = true }: { mfa?: boolean } = {},
): Promise<void> {
  const env = localSupabaseEnv();
  const admin = serviceClient(env);

  const created = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    email_confirm: true,
  });
  let adminId = created.data.user?.id;
  if (!adminId) {
    const { data: list, error: listError } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listError) throw new Error(`listUsers: ${listError.message}`);
    adminId = list.users.find((u) => u.email === ADMIN_EMAIL)?.id;
  }
  if (!adminId) throw new Error("Could not create or find the e2e admin");

  const { error: adminError } = await admin
    .schema("qkit")
    .from("admins")
    .upsert({ user_id: adminId });
  if (adminError) throw new Error(`admins: ${adminError.message}`);

  const cookies = await sessionCookies(
    env,
    admin,
    { email: ADMIN_EMAIL, id: adminId },
    { mfa },
  );
  await context.addCookies(
    cookies.map(([name, value]) => ({ name, value, url: baseURL })),
  );
}
