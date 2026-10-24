import { z } from "zod";
import type {
  MenuCategory,
  MenuItem,
  OptionGroup,
  OrderItem,
  SocialLinks,
} from "@/lib/types";
import type { BoothHours } from "@/lib/hours";
import { OPTION_CODE_MAX } from "@/lib/ticket";

// Shared with passwordChangeSchema below — Supabase Auth config owns the
// real policy, this is just the client-side form floor matching it.
export const PASSWORD_MIN_LENGTH = 8;

export const loginSchema = z.object({
  email: z.email("Invalid email"),
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    ),
});

export const vendorSchema = z.object({
  name: z.string().min(1, "Stall name is required").max(100),
});

// Images come from two sources: the uploader (absolute Supabase URL) and seeded
// art (relative `/seed/...` path). z.string().url() rejects the latter, so accept
// either an http(s) URL or a leading-slash local path. Shared by booth banners
// (nullable, required key) and menu-item photos (also optional).
const imageUrlString = z
  .string()
  .refine((s) => /^https?:\/\//.test(s) || s.startsWith("/"), {
    message: "Must be a URL or a local path",
  });
const menuImageUrl = imageUrlString.nullable().optional();

// Upper bound for any money field (cents). $10k — matches the admin pricing cap
// and keeps totals well inside a signed INTEGER even at max quantity/line count.
export const MAX_MONEY_CENTS = 10_000_00;
// Cart line cap — mirrors the DB guard inside place_order (jsonb_array_length).
export const MAX_CART_LINES = 50;

// EU's 14-allergen list (Reg 1169/2011) plus caffeine. Additive only — never
// rename/remove a value, it's a raw string in saved menu_items JSONB.
export const ALLERGEN_TAGS = [
  "dairy",
  "nuts",
  "gluten",
  "soy",
  "egg",
  "caffeine",
  "crustaceans",
  "fish",
  "peanuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;
export type AllergenTag = (typeof ALLERGEN_TAGS)[number];

export const optionChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  // Additive only — a selected choice adds cost, never reduces it. Bounded
  // by MAX_MONEY_CENTS same as every other money field, so a forged delta
  // can't overflow total_cents once summed across a cart.
  price_delta_cents: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_MONEY_CENTS)
    .optional(),
  // Vendor's extra unit cost for this choice — optional, mirrors the base
  // item's own cost_cents optionality. Never sent to customers.
  cost_delta_cents: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_MONEY_CENTS)
    .optional(),
  // Only tag an allergen that actually varies by choice — see
  // menuItemFormSchema's allergens for the fixed-ingredient half.
  allergens: z.array(z.enum(ALLERGEN_TAGS)).optional(),
  // The vendor's own shorthand for this choice on the order ticket ("LS" for
  // "Less sugar"). Optional; a choice without one prints in full. See
  // ticketOptions in @/lib/ticket.
  code: z.string().trim().max(OPTION_CODE_MAX).optional(),
});

export const optionGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  // false/undefined = single-select; true = multi-select (checkbox).
  multiple: z.boolean().optional(),
  // A group with no choices can't be satisfied; drop it on read so it never
  // reaches the customizer (which would crash trying to resolve a default).
  choices: z.array(optionChoiceSchema).min(1),
});

/**
 * Drop half-filled option groups before validation/save: trim labels, remove
 * blank-label choices, then remove groups left with a blank label or no choices.
 * Returns undefined when nothing survives, so plain items carry no empty array.
 */
export function sanitizeOptionGroups(
  groups: OptionGroup[] | undefined,
): OptionGroup[] | undefined {
  if (!groups || groups.length === 0) return undefined;
  const cleaned = groups
    .map((g) => ({
      ...g,
      label: g.label.trim(),
      choices: g.choices
        .map((c) => ({ ...c, label: c.label.trim() }))
        .filter((c) => c.label.length > 0),
    }))
    .filter((g) => g.label.length > 0 && g.choices.length > 0);
  return cleaned.length ? cleaned : undefined;
}

export const selectedOptionSchema = z.object({
  group: z.string().min(1).max(100),
  choice: z.string().min(1).max(100),
});

// Cross-kit customer identity (see docs/business/2026-08-16-cross-kit-
// customer-identity-design.md): a genuinely optional convenience field, not a
// verified identity — same trust level customerName already has, no format
// validation beyond a loose length bound. Left as a plain optional string
// (not trim-and-blank-to-undefined here) so the form's inferred field type
// stays a simple `string | undefined` — placeOrder normalizes a blank value
// to "omitted" right before the RPC call, the one place it actually matters.
const customerPhone = z.string().trim().max(30).optional();

export const placeOrderSchema = z.object({
  customerName: z.string().min(1, "Your name is required").max(100),
  customerPhone,
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1).max(200),
        name: z.string().max(200),
        price_cents: z
          .number()
          .int()
          .nonnegative()
          .max(MAX_MONEY_CENTS)
          .optional(),
        quantity: z.number().int().min(1).max(20),
        options: z.array(selectedOptionSchema).max(20).optional(),
      }),
    )
    .min(1, "Add at least one item")
    .max(MAX_CART_LINES, "Too many items"),
});

export const menuItemFormSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Item name is required").max(100),
  description: z.string().max(500).default(""),
  // Bounded so a forged price can't overflow total_cents (INTEGER) once summed
  // across a full cart at max quantity.
  price_cents: z.number().int().nonnegative().max(MAX_MONEY_CENTS).optional(),
  // Vendor's unit cost — drives margin stats. Never sent to customers.
  cost_cents: z.number().int().nonnegative().max(MAX_MONEY_CENTS).optional(),
  image_url: menuImageUrl,
  // The menu editor builds these; sanitizeOptionGroups runs before save so a
  // half-filled group never reaches optionGroupSchema (choices.min(1)).
  option_groups: z.array(optionGroupSchema).optional(),
  // Id of an entry in the booth's menu_categories list. Not itself
  // validated against that list here (a stale/removed id is treated as
  // "Other" at render time) — see MenuItem.category.
  category: z.string().nullable().optional(),
  available: z.boolean(),
  // Optional sold-out cap (Pro). null/absent = unlimited.
  stock: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
  // Only fixed/inherent allergens that no customization changes — see
  // optionChoiceSchema's allergens for anything that varies by choice.
  allergens: z.array(z.enum(ALLERGEN_TAGS)).optional(),
});

/** One ordered menu section (`booths.menu_categories`). Stable `id` so
 * renaming a section never requires rewriting every item that references it. */
export const menuCategorySchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(40),
});

/** Ordered menu sections (`booths.menu_categories`). */
export const menuCategoriesSchema = z.array(menuCategorySchema).max(40);

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const dayWindowSchema = z.object({ open: hhmm, close: hhmm });

/**
 * Booth working hours (stored as JSONB). null = no restriction. Same schema
 * for read and write: tolerant in that an unparseable JSONB value falls back to
 * null via parseBoothHours, strict in that the editor must emit valid windows.
 */
export const boothHoursSchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("daily"), open: hhmm, close: hhmm }),
    z.object({
      mode: z.literal("weekly"),
      days: z.object({
        mon: dayWindowSchema.nullable(),
        tue: dayWindowSchema.nullable(),
        wed: dayWindowSchema.nullable(),
        thu: dayWindowSchema.nullable(),
        fri: dayWindowSchema.nullable(),
        sat: dayWindowSchema.nullable(),
        sun: dayWindowSchema.nullable(),
      }),
    }),
  ])
  .nullable();

// ── Payment marker ───────────────────────────────────────────────────────────
// booths.payment holds only which kind of payment a booth takes. The details
// (payee, UEN, mobile number, link, QR image) are entered and validated in
// paykit, vendor-wide; qkit keeps no rule about them. See @/lib/payment-marker.
export const paymentMarkerSchema = z.object({
  kind: z.enum(["pointer", "paynow"]),
});

export const paymentStatusSchema = z.enum([
  "not_required",
  "pending",
  "claimed",
  "confirmed",
]);

export const printStatusSchema = z.enum([
  "not_required",
  "queued",
  "sent",
  "printed",
  "failed",
]);

// Customer order-route params, shared by the status page and its status/payment
// polling reads. boothId is a UUID; order numbers are short sequential per-booth
// strings (bounded to reject junk before it reaches a query).
/** Any id that is a uuid (booth, order, vendor, idempotency key, session). */
export const uuidSchema = z.uuid();

export const orderBoothIdSchema = uuidSchema;
export const orderNumberSchema = z.string().min(1).max(40);
// Per-order access token minted by place_order; gates the status page + its
// polling/claim reads so booth_id + sequential order_number alone can't
// enumerate other customers' orders.
export const orderTokenSchema = z.uuid();

export type OrderRef = { boothId: string; orderNumber: string; token: string };
export type ParseOrderRefResult =
  | { ok: true; ref: OrderRef }
  | { ok: false; field: "booth" | "orderNumber" | "token" };

/**
 * Validate the (boothId, orderNumber, token) triple every customer order action
 * receives, in one place. Returns the offending `field` on failure so callers
 * that surface a per-field message (claim/unclaim) can, while callers that just
 * bail to null (status/payment polls) ignore it. First failure wins.
 */
export function parseOrderRef(
  boothId: string,
  orderNumber: string,
  token: string,
): ParseOrderRefResult {
  if (!orderBoothIdSchema.safeParse(boothId).success)
    return { ok: false, field: "booth" };
  if (!orderNumberSchema.safeParse(orderNumber).success)
    return { ok: false, field: "orderNumber" };
  if (!orderTokenSchema.safeParse(token).success)
    return { ok: false, field: "token" };
  return { ok: true, ref: { boothId, orderNumber, token } };
}

export type ParsePreClaimRefResult =
  | { ok: true; ref: { boothId: string; token: string } }
  | { ok: false; field: "booth" | "token" };

/**
 * Validate the (boothId, token) pair for the pre-claim flow, where a
 * payment-required order has no order_number yet — same shape as
 * parseOrderRef minus the orderNumber leg.
 */
export function parsePreClaimRef(
  boothId: string,
  token: string,
): ParsePreClaimRefResult {
  if (!orderBoothIdSchema.safeParse(boothId).success)
    return { ok: false, field: "booth" };
  if (!orderTokenSchema.safeParse(token).success)
    return { ok: false, field: "token" };
  return { ok: true, ref: { boothId, token } };
}

// ── Social/website links ─────────────────────────────────────────────────────
// Vendor profile (vendors.social_links) and per-booth (booths.social_links).
// All fields optional; an absent/empty object means "nothing set".

const socialUrl = z
  .string()
  .trim()
  .max(300)
  .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) link")
  .optional();

export const socialLinksSchema = z.object({
  website: socialUrl,
  instagram: socialUrl,
  facebook: socialUrl,
  tiktok: socialUrl,
});
export type SocialLinksInput = z.infer<typeof socialLinksSchema>;

/** Parse a JSONB social_links value; any malformed shape degrades to {}. */
export function parseSocialLinks(data: unknown): SocialLinks {
  const parsed = socialLinksSchema.safeParse(data);
  return parsed.success ? parsed.data : {};
}

/**
 * Effective social links for a booth: the booth's own override if it set
 * one, otherwise the vendor's profile-level default. Whole-object override —
 * a booth that sets only `instagram` does NOT also inherit the vendor's
 * `website`, matching booths.hours/booths.payment's null-degrades semantics.
 */
export function resolveSocialLinks(
  boothLinks: SocialLinks | null,
  vendorLinks: SocialLinks,
): SocialLinks {
  return boothLinks ?? vendorLinks;
}

export const boothFormSchema = z.object({
  boothId: z.uuid().optional(),
  name: z.string().min(1, "Booth name is required").max(100),
  image_url: imageUrlString.nullable(),
  is_active: z.boolean(),
  hours: boothHoursSchema.default(null),
  // Not menu_items — saveMenuItems owns that column exclusively now.
  menu_categories: menuCategoriesSchema.default([]),
  // The form's "Take payment for orders at this booth" switch. saveBooth
  // turns it into the stored marker using the kind paykit reports.
  takes_payment: z.boolean().default(false),
  // null = inherit the vendor's profile-level defaults; non-null = a
  // complete per-booth override. See resolveSocialLinks.
  social_links: socialLinksSchema.nullable().default(null),
  // Perishable-immediately items (ice cream) — hold prep until the customer
  // confirms arrival on their status page. See migration 0064.
  requires_arrival_confirm: z.boolean().default(false),
  // Event-mode setup: makes the live board auto-open walk-up order entry
  // instead of the QR/menu-first presentation. See migration 0080.
  walkup_default: z.boolean().default(false),
  // Per-booth opt-in for printkit label printing. See migration 0082.
  print_enabled: z.boolean().default(false),
  // Per-booth self-checkout pickup: a ready order's status page shows a QR
  // for this booth's pickup kiosk. See migration 0104.
  pickup_scan_enabled: z.boolean().default(false),
  // Vendor-pasted paykit booking id, event-mode booths only. Unvalidated
  // against paykit at write time — just stored. See migration 0083.
  paykit_booking_id: z.string().trim().max(200).nullable().default(null),
  // Items the booth will sell in one SGT day, across its whole menu; null =
  // no cap. Counted as the sum of item quantities, not orders, since one order
  // can carry several. Enforced in Postgres by the orders_daily_cup_cap
  // trigger, so this bound is a form guard, not the limit itself. The column
  // keeps its 0094 name; "cup" there means any item.
  // The form sends null for a blank field (same convention as
  // board_settings.default_prep_minutes), not an empty string.
  daily_cup_cap: z
    .number()
    .int()
    .positive()
    .max(100_000)
    .nullable()
    .default(null),
  // Most items one customer order may carry; null = no limit. Enforced by the
  // orders_max_items_per_order trigger (migration 0096), which exempts
  // walk-up orders the vendor enters.
  max_items_per_order: z
    .number()
    .int()
    .positive()
    .max(100)
    .nullable()
    .default(null),
});

/** Parse a JSONB hours value; any malformed shape degrades to null (open). */
export function parseBoothHours(data: unknown): BoothHours {
  const parsed = boothHoursSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

// ── Admin: pricing + license minting ─────────────────────────────────────────

export const pricingFormSchema = z.object({
  event_pass_cents: z.number().int().nonnegative().max(MAX_MONEY_CENTS),
  monthly_cents: z.number().int().nonnegative().max(MAX_MONEY_CENTS),
});
export type PricingFormInput = z.infer<typeof pricingFormSchema>;

export const bannerFormSchema = z.object({
  banner_enabled: z.boolean(),
  banner_message: z.string().max(280),
});
export type BannerFormInput = z.infer<typeof bannerFormSchema>;

export const grantPassSchema = z.object({
  vendorId: z.uuid(),
  // Sold per day; 1 covers a few-hour market, up to 14 for long bazaars/fairs.
  days: z.number().int().positive().max(14),
  // When the pass starts (ISO). Omitted = starts now. Lets a vendor schedule it
  // for their event date; entitlement is computed from [validFrom, expires_at).
  validFromIso: z.string().datetime().optional(),
  note: z.string().max(200).optional(),
  // What qkit actually collected (cents). 0/omitted = free comp / design partner.
  amountCents: z.number().int().nonnegative().max(MAX_MONEY_CENTS).optional(),
});
export type GrantPassInput = z.infer<typeof grantPassSchema>;

// ── In-product feedback ──────────────────────────────────────────────────────

export const feedbackSchema = z
  .object({
    source: z.enum(["customer", "vendor"]),
    boothId: z.uuid().optional(),
    orderNumber: orderNumberSchema.optional(),
    // Per-order access token — proves a customer reviewer actually placed the
    // order (the RPC rejects customer feedback whose token doesn't match).
    token: z.uuid().optional(),
    // customer order rating
    rating: z.number().int().min(1).max(5).optional(),
    // vendor → qkit loyalty
    nps: z.number().int().min(0).max(10).optional(),
    message: z.string().trim().max(2000).optional(),
  })
  // Require at least a score (rating or NPS) or a non-empty message.
  .refine(
    (d) =>
      d.rating != null || d.nps != null || (d.message && d.message.length > 0),
    {
      message: "Add a rating or a message",
      path: ["message"],
    },
  );
export type FeedbackInput = z.infer<typeof feedbackSchema>;

// ── Support / help requests ──────────────────────────────────────────────────

// A vendor-reported problem the admin resolves in the dashboard. Category lets
// the admin triage (pass/payment/pro billing issues vs. a general note).
export const supportMessageSchema = z.object({
  category: z.enum(["pass", "payment", "pro", "other"]),
  body: z.string().trim().min(1, "Tell us what's wrong").max(2000),
});
export type SupportMessageInput = z.infer<typeof supportMessageSchema>;

// ── Account / profile ────────────────────────────────────────────────────────

// Stall name shown to customers (vendors.name). Same rule as vendorSchema — the
// authenticated role may UPDATE (name, tours_seen) under RLS vendors_self_update.
export const profileNameSchema = z.object({
  name: z.string().min(1, "Stall name is required").max(100),
});

// Personal display name on the auth user (user_metadata.display_name). Optional:
// an empty string clears it. Trimmed so trailing whitespace can't slip past max.
export const displayNameSchema = z.object({
  displayName: z.string().trim().max(60, "Display name is too long"),
});

// New password + confirm. Min length shares PASSWORD_MIN_LENGTH with
// loginSchema; confirm must match.
export const passwordChangeSchema = z
  .object({
    password: z
      .string()
      .min(
        PASSWORD_MIN_LENGTH,
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      ),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

// Live-order-board preferences (vendors.board_settings). Minutes are capped
// generously (240 = 4hr) — this isn't a hard product limit, just a guard
// against fat-fingered values that would make the aging system meaningless.
const boardSettingsFields = z.object({
  aging_min: z.number().int().min(1).max(240),
  overdue_min: z.number().int().min(1).max(240),
  sound_id: z.enum(["chime", "bell", "ding", "horn", "triple", "none"]),
  desktop_notify: z.boolean(),
  // Bounded well below the aging/overdue minute range — this is a
  // seconds-scale undo grace period, not a display threshold. 2s floor
  // keeps it long enough to actually tap; 15s ceiling matches what a
  // vendor originally proposed as a reasonable outer bound.
  undo_seconds: z.number().int().min(2).max(15),
  daily_order_number_reset: z.boolean(),
  // false = the status page always shows a queue-position label, never a
  // minute guess — the "orders ahead of you" line itself is unaffected,
  // this only gates the numeric estimate layered on top of it (see
  // getWaitEstimate in status-actions.ts).
  show_wait_estimate: z.boolean(),
  // null = no vendor-set fallback (the wait estimate falls back to a
  // queue-position label instead — see estimateWaitSeconds). 1-60min is a
  // generous bound against a fat-fingered value, same rationale as the
  // aging/overdue caps above.
  default_prep_minutes: z.number().int().min(1).max(60).nullable(),
  // null = the auto-clear sweep is off. 1-60min mirrors default_prep_minutes'
  // bound rationale — generous headroom against a fat-fingered value.
  ready_auto_clear_min: z.number().int().min(1).max(60).nullable(),
  // Opt-out, not opt-in: the customer already consented to the Telegram
  // "order ready" ping by connecting (merqo's own consent model, untouched
  // by this flag). Default true so every pre-existing vendor row (this key
  // postdates the column) keeps notifying exactly as before this shipped —
  // only an explicit `false` (a vendor who finds it off-brand) turns it off.
  customer_telegram_notify_enabled: z.boolean().default(true),
});

export const boardSettingsSchema = boardSettingsFields.refine(
  (d) => d.overdue_min > d.aging_min,
  {
    message: "Overdue must be later than amber",
    path: ["overdue_min"],
  },
);

export const boardSettingsPatchSchema = boardSettingsFields
  .partial()
  .extend({
    customer_telegram_notify_enabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Choose a setting to update",
  );
export type BoardSettingsPatch = z.infer<typeof boardSettingsPatchSchema>;

export type ProfileNameInput = z.infer<typeof profileNameSchema>;
export type DisplayNameInput = z.infer<typeof displayNameSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type BoardSettingsInput = z.infer<typeof boardSettingsSchema>;

export type LoginInput = z.infer<typeof loginSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type VendorInput = z.infer<typeof vendorSchema>;
export type MenuItemFormInput = z.infer<typeof menuItemFormSchema>;
export type BoothFormInput = z.infer<typeof boothFormSchema>;

// Input schema for saveMenuItems.
export const menuItemsInputSchema = z.array(menuItemFormSchema);

// ── Stored-JSONB read schemas ────────────────────────────────────────────────
// `booths.menu_items` and `orders.items` are JSONB (typed `Json`). Parse them at
// read boundaries instead of casting. Read schemas are tolerant (no upper bounds)
// — placeOrderSchema above stays strict for the write boundary.

export const menuItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  price_cents: z.number().int().nonnegative().optional(),
  cost_cents: z.number().int().nonnegative().optional(),
  image_url: menuImageUrl,
  available: z.boolean(),
  option_groups: z.array(optionGroupSchema).optional(),
  category: z.string().nullable().optional(),
  stock: z.number().int().nonnegative().nullable().optional(),
  allergens: z.array(z.enum(ALLERGEN_TAGS)).optional(),
});

/** Parse a JSONB booths.menu_categories value; any malformed shape degrades to []. */
export function parseMenuCategories(data: unknown): MenuCategory[] {
  const parsed = menuCategoriesSchema.safeParse(data);
  return parsed.success ? parsed.data : [];
}

export const orderItemSchema = z.object({
  menuItemId: z.string(),
  name: z.string(),
  price_cents: z.number().int().nonnegative().optional(),
  // Snapshotted from the menu at order time (server-side), for margin stats.
  cost_cents: z.number().int().nonnegative().optional(),
  quantity: z.number().int().min(1),
  options: z.array(selectedOptionSchema).optional(),
});

export const orderStatusSchema = z.enum([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
]);

/** Full `orders` row — validates untrusted realtime payloads before use. */
export const orderRowSchema = z.object({
  id: z.string(),
  booth_id: z.string(),
  order_number: z.string().nullable(),
  customer_name: z.string(),
  items: z.array(orderItemSchema),
  status: orderStatusSchema,
  total_cents: z.number().int().nonnegative(),
  payment_status: paymentStatusSchema,
  payment_method_kind: z
    .enum(["pointer", "paynow"])
    .nullable()
    // Tolerant read: an unknown kind from an old/foreign row degrades to null
    // rather than dropping the whole realtime order.
    .catch(null),
  paid_at: z.string().nullable(),
  payment_proof_path: z.string().nullable().catch(null),
  payment_proof_hash: z.string().nullable().catch(null),
  // Tolerant like source/auto_completed below — a payload from mid-deploy
  // (before migration 0081 lands everywhere) shouldn't drop the event;
  // degrade to the column's own DB default.
  print_status: printStatusSchema.catch("not_required"),
  print_status_updated_at: z.string().nullable().catch(null),
  created_at: z.string(),
  ready_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  updated_at: z.string(),
  idempotency_key: z.string().nullable(),
  // Parsed then immediately stripped in parseRealtimeOrderEvent — the board
  // never reads it, but the raw Postgres row always carries it, so it must
  // parse here first. Tolerant so a payload missing it degrades to "" instead
  // of dropping the whole event.
  access_token: z.string().catch(""),
  priority_bumped_at: z.string().nullable(),
  // Tolerant like payment_method_kind above — a payload from mid-deploy
  // (before migration 0060 landed everywhere) shouldn't drop the event.
  source: z.enum(["qr", "walkup"]).catch("qr"),
  // Tolerant like source above — a payload from mid-deploy (before migration
  // 0065 lands everywhere) shouldn't drop the event; degrade to false,
  // matching the column's own DB default.
  auto_completed: z.boolean().catch(false),
});

/** Parse a JSONB menu_items value, dropping any malformed entries. */
export function parseMenuItems(data: unknown): MenuItem[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((d) => {
    const parsed = menuItemSchema.safeParse(d);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Parse a JSONB order items value, dropping any malformed entries. */
export function parseOrderItems(data: unknown): OrderItem[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((d) => {
    const parsed = orderItemSchema.safeParse(d);
    return parsed.success ? [parsed.data] : [];
  });
}
