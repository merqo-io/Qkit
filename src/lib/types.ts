export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

// "qr" = customer-placed via their own device; "walkup" = staff-entered from
// the dashboard on behalf of a counter customer. Defaults to "qr" at the DB
// level (migration 0060) — every pre-existing order was.
export type OrderSource = "qr" | "walkup";

export type Plan = "free" | "pro";

export type SoundId = "chime" | "bell" | "ding" | "horn" | "triple" | "none";

// Vendor live-order-board preferences (qkit.vendors.board_settings jsonb).
// Defaults here must match the column default in migration 0050
// (undo_seconds added + backfilled in migration 0059; daily_order_number_reset
// + default_prep_minutes added + backfilled in migration 0062;
// daily_order_number_reset flipped true, vendor-wide, in migration 0067;
// show_wait_estimate added + backfilled true in migration 0068).
// Map of dashboard tourId -> ISO timestamp first seen, one entry per page's
// own tour (see @merqo/ui's DashboardTours). Replaces the single-tour
// tour_seen_at column (migration 0023), retired by migration 0092.
export type ToursSeen = Record<string, string>;

// Falls back to this until migration 0092 (tours_seen column) has been
// applied to the environment's DB — same deploy/migrate skew rationale as
// DEFAULT_BOARD_SETTINGS below.
export const DEFAULT_TOURS_SEEN: ToursSeen = {};

export type BoardSettings = {
  // Amber threshold, minutes since order created.
  aging_min: number;
  // Red threshold, minutes; must be > aging_min.
  overdue_min: number;
  sound_id: SoundId;
  desktop_notify: boolean;
  // How long OrderCard's advance-undo affordance (Mark Ready/Mark Picked
  // Up) stays live before finalizing — see order-card.tsx's UNDO_MS.
  undo_seconds: number;
  // Display-only: the board and the customer status page show each order's
  // position among today's orders (1, 2, 3…) instead of its real, permanent
  // order_number. That real number never changes — see
  // src/lib/orders.ts#displayOrderNumber.
  daily_order_number_reset: boolean;
  // false = the status page always shows a queue-position label, never a
  // minute guess — the "orders ahead of you" line itself is unaffected,
  // only the numeric estimate layered on top of it. See getWaitEstimate in
  // status-actions.ts. Default true.
  show_wait_estimate: boolean;
  // Vendor-set fallback prep time (minutes) for the customer wait estimate,
  // used only when there isn't enough of today's order history yet to
  // compute one from real data (see estimateWaitSeconds in @/lib/stats).
  // null = no fallback configured; the page shows queue position instead.
  default_prep_minutes: number | null;
  // Minutes a 'ready' order can sit uncollected before it auto-flips to
  // 'completed' (sweepReadyOrders, order-actions.ts). null disables the
  // sweep. Default 3 — see migration 0065.
  ready_auto_clear_min: number | null;
  // Vendor-side opt-out for the customer Telegram "order ready" ping
  // (advanceOrder's ready transition, see customerNotifyEnabled in
  // order-actions.ts) — a brand-preference switch layered on top of the
  // customer's own consent (merqo's, untouched by this). Default true: the
  // customer already asked for this by connecting.
  customer_telegram_notify_enabled: boolean;
};

// Falls back to this until migration 0050 (board_settings column) has been
// applied to the environment's DB — app deploy and DB migration aren't
// atomic, so a vendor row can briefly lack the column (or a key added to it
// later, e.g. undo_seconds pre-0059) even though this type says it's required.
export const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  aging_min: 5,
  overdue_min: 10,
  sound_id: "chime",
  desktop_notify: false,
  daily_order_number_reset: true,
  show_wait_estimate: true,
  default_prep_minutes: null,
  undo_seconds: 4,
  ready_auto_clear_min: 3,
  customer_telegram_notify_enabled: true,
};

export type PaymentStatus =
  | "not_required"
  | "pending"
  | "claimed"
  | "confirmed";

export type PrintStatus =
  | "not_required"
  | "queued"
  | "sent"
  | "printed"
  | "failed";

// The kind stored in booths.payment (JSONB, a `{kind}` marker) and mirrored
// on orders.payment_method_kind. The payment details live in paykit.
export type PaymentKind = "pointer" | "paynow";

// Vendor/booth social + website links (qkit.vendors.social_links,
// qkit.booths.social_links jsonb). All fields optional; an absent/empty
// object means "nothing set".
export type SocialLinks = {
  website?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
};

// Mirrors ALLERGEN_TAGS in src/lib/schemas.ts.
export type AllergenTag =
  | "dairy"
  | "nuts"
  | "gluten"
  | "soy"
  | "egg"
  | "caffeine"
  | "crustaceans"
  | "fish"
  | "peanuts"
  | "celery"
  | "mustard"
  | "sesame"
  | "sulphites"
  | "lupin"
  | "molluscs";

export type OptionChoice = {
  id: string;
  label: string;
  // Additive only — a selected choice adds cost, never reduces it. Never
  // trusted from the client; place_order re-derives from the stored menu.
  price_delta_cents?: number;
  // Vendor's extra unit cost for this choice. Never shown to customers.
  cost_delta_cents?: number;
  // Only tag an allergen that actually varies by choice (e.g. "Regular Milk"
  // -> ["dairy"], "Oat Milk" -> []) — see MenuItem.allergens for the
  // fixed-ingredient half of this model.
  allergens?: AllergenTag[];
  // The vendor's own shorthand for this choice on the order ticket ("LS" for
  // "Less sugar"). A choice without one prints in full.
  code?: string;
};
export type OptionGroup = {
  id: string;
  label: string;
  // false/undefined = single-select (radio, exactly one); true = multi-select
  // (checkbox, zero or more). A multi group emits several SelectedOption rows.
  multiple?: boolean;
  choices: OptionChoice[];
};
export type SelectedOption = { group: string; choice: string };

// One ordered menu section (`booths.menu_categories`). Stable `id` so
// renaming a section never requires rewriting every item that references it.
export type MenuCategory = { id: string; label: string };

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price_cents?: number;
  // Vendor's unit cost (optional). Drives margin/profit stats. Never shown to
  // customers — server strips it from the public booth read.
  cost_cents?: number;
  image_url?: string | null;
  available: boolean;
  option_groups?: OptionGroup[];
  // Id of an entry in the booth's menu_categories list. Unset/unmatched
  // falls into the "Other" bucket, always rendered last.
  category?: string | null;
  // Optional sold-out cap (Pro). null/absent = unlimited. Remaining is computed
  // live from non-cancelled orders (see booth_remaining_stock) — not decremented.
  stock?: number | null;
  // Only fixed/inherent allergens that no customization changes — see
  // OptionChoice.allergens for anything that varies by choice.
  allergens?: AllergenTag[];
};

export type CartItem = {
  menuItemId: string;
  name: string;
  price_cents?: number;
  quantity: number;
  options?: SelectedOption[];
};

export type OrderItem = {
  menuItemId: string;
  name: string;
  price_cents?: number;
  // Snapshotted at order time so historical profit is immune to later cost edits.
  cost_cents?: number;
  quantity: number;
  options?: SelectedOption[];
};

export interface Database {
  qkit: {
    Tables: {
      vendors: {
        Row: {
          id: string;
          plan: Plan;
          created_at: string;
          tours_seen: ToursSeen;
          board_settings: BoardSettings;
        };
        Insert: {
          id: string;
          plan?: Plan;
          created_at?: string;
          tours_seen?: ToursSeen;
          board_settings?: BoardSettings;
        };
        Update: {
          id?: string;
          plan?: Plan;
          created_at?: string;
          tours_seen?: ToursSeen;
          board_settings?: BoardSettings;
        };
        Relationships: [];
      };
      admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
      admin_audit: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          target_id: string | null;
          detail: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action: string;
          target_id?: string | null;
          detail?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          action?: string;
          target_id?: string | null;
          detail?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          vendor_id: string | null;
          type: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id?: string | null;
          type: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string | null;
          type?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      licenses: {
        Row: {
          id: string;
          vendor_id: string;
          valid_from: string;
          expires_at: string;
          source: string;
          note: string | null;
          label: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          valid_from?: string;
          expires_at: string;
          source?: string;
          note?: string | null;
          label?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          valid_from?: string;
          expires_at?: string;
          source?: string;
          note?: string | null;
          label?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "licenses_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          vendor_id: string;
          kind: "pass" | "subscription";
          amount_cents: number;
          source: string;
          note: string | null;
          license_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          kind: "pass" | "subscription";
          amount_cents: number;
          source?: string;
          note?: string | null;
          license_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          kind?: "pass" | "subscription";
          amount_cents?: number;
          source?: string;
          note?: string | null;
          license_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      pricing: {
        Row: {
          id: number;
          event_pass_cents: number;
          monthly_cents: number;
          currency: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          event_pass_cents?: number;
          monthly_cents?: number;
          currency?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          event_pass_cents?: number;
          monthly_cents?: number;
          currency?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_settings: {
        Row: {
          id: number;
          banner_enabled: boolean;
          banner_message: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          banner_enabled?: boolean;
          banner_message?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          banner_enabled?: boolean;
          banner_message?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      legal_check_state: {
        Row: {
          email: string;
          checked_at: string;
          is_current: boolean;
        };
        Insert: {
          email: string;
          checked_at?: string;
          is_current: boolean;
        };
        Update: {
          email?: string;
          checked_at?: string;
          is_current?: boolean;
        };
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          source: "customer" | "vendor";
          vendor_id: string | null;
          booth_id: string | null;
          order_number: string | null;
          rating: number | null;
          message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source: "customer" | "vendor";
          vendor_id?: string | null;
          booth_id?: string | null;
          order_number?: string | null;
          rating?: number | null;
          message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          source?: "customer" | "vendor";
          vendor_id?: string | null;
          booth_id?: string | null;
          order_number?: string | null;
          rating?: number | null;
          message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      purchase_requests: {
        Row: {
          id: string;
          vendor_id: string;
          kind: "event" | "monthly";
          status: "pending" | "resolved";
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          kind: "event" | "monthly";
          status?: "pending" | "resolved";
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          kind?: "event" | "monthly";
          status?: "pending" | "resolved";
          created_at?: string;
        };
        Relationships: [];
      };
      booths: {
        Row: {
          id: string;
          vendor_id: string;
          name: string;
          menu_items: Json;
          menu_categories: Json;
          is_active: boolean;
          image_url: string | null;
          hours: Json | null;
          order_seq: number;
          payment: Json | null;
          created_at: string;
          short_code: string;
          social_links: Json | null;
          requires_arrival_confirm: boolean;
          walkup_default: boolean;
          print_enabled: boolean;
          paykit_booking_id: string | null;
          printkit_location_id: string | null;
          daily_cup_cap: number | null;
          max_items_per_order: number | null;
          pickup_scan_enabled: boolean;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          menu_items?: Json;
          menu_categories?: Json;
          is_active?: boolean;
          image_url?: string | null;
          hours?: Json | null;
          order_seq?: number;
          payment?: Json | null;
          created_at?: string;
          short_code?: string;
          social_links?: Json | null;
          requires_arrival_confirm?: boolean;
          walkup_default?: boolean;
          print_enabled?: boolean;
          paykit_booking_id?: string | null;
          printkit_location_id?: string | null;
          daily_cup_cap?: number | null;
          max_items_per_order?: number | null;
          pickup_scan_enabled?: boolean;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          name?: string;
          menu_items?: Json;
          menu_categories?: Json;
          is_active?: boolean;
          image_url?: string | null;
          hours?: Json | null;
          order_seq?: number;
          payment?: Json | null;
          created_at?: string;
          short_code?: string;
          social_links?: Json | null;
          requires_arrival_confirm?: boolean;
          walkup_default?: boolean;
          print_enabled?: boolean;
          paykit_booking_id?: string | null;
          printkit_location_id?: string | null;
          daily_cup_cap?: number | null;
          max_items_per_order?: number | null;
          pickup_scan_enabled?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "booths_vendor_id_fkey";
            columns: ["vendor_id"];
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          booth_id: string;
          order_number: string | null;
          customer_name: string;
          items: Json;
          status: OrderStatus;
          total_cents: number;
          payment_status: PaymentStatus;
          payment_method_kind: PaymentKind | null;
          paid_at: string | null;
          payment_proof_path: string | null;
          payment_proof_hash: string | null;
          print_status: PrintStatus;
          print_status_updated_at: string | null;
          created_at: string;
          ready_at: string | null;
          completed_at: string | null;
          updated_at: string;
          idempotency_key: string | null;
          access_token: string;
          priority_bumped_at: string | null;
          source: OrderSource;
          auto_completed: boolean;
        };
        Insert: {
          id?: string;
          booth_id: string;
          order_number: string | null;
          customer_name: string;
          items: Json;
          status?: OrderStatus;
          total_cents: number;
          payment_status?: PaymentStatus;
          payment_method_kind?: PaymentKind | null;
          paid_at?: string | null;
          payment_proof_path?: string | null;
          payment_proof_hash?: string | null;
          print_status?: PrintStatus;
          print_status_updated_at?: string | null;
          created_at?: string;
          ready_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
          idempotency_key?: string | null;
          access_token?: string;
          priority_bumped_at?: string | null;
          source?: OrderSource;
          auto_completed?: boolean;
        };
        Update: {
          id?: string;
          booth_id?: string;
          order_number?: string | null;
          customer_name?: string;
          items?: Json;
          status?: OrderStatus;
          total_cents?: number;
          payment_status?: PaymentStatus;
          payment_method_kind?: PaymentKind | null;
          paid_at?: string | null;
          payment_proof_path?: string | null;
          payment_proof_hash?: string | null;
          print_status?: PrintStatus;
          print_status_updated_at?: string | null;
          created_at?: string;
          ready_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
          idempotency_key?: string | null;
          access_token?: string;
          priority_bumped_at?: string | null;
          source?: OrderSource;
          auto_completed?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "orders_booth_id_fkey";
            columns: ["booth_id"];
            referencedRelation: "booths";
            referencedColumns: ["id"];
          },
        ];
      };
      booth_item_sold: {
        Row: { booth_id: string; menu_item_id: string; qty: number };
        Insert: { booth_id: string; menu_item_id: string; qty?: number };
        Update: { booth_id?: string; menu_item_id?: string; qty?: number };
        Relationships: [];
      };
      order_status_events: {
        Row: {
          id: string;
          order_id: string;
          from_status: string | null;
          to_status: string;
          actor: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          from_status?: string | null;
          to_status: string;
          actor?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          from_status?: string | null;
          to_status?: string;
          actor?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_status_events_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      // Service-role only (migration 0105): no anon/authenticated grant.
      order_push_subscriptions: {
        Row: {
          id: string;
          order_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          title: string;
          body: string;
          url: string;
          tag: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          title: string;
          body: string;
          url: string;
          tag: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          title?: string;
          body?: string;
          url?: string;
          tag?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_push_subscriptions_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: { p_uid: string };
        Returns: boolean;
      };
      patch_board_settings: {
        Args: { p_patch: Json };
        Returns: Json;
      };
      // Internal validator used by definer order RPCs; no public EXECUTE grant.
      validate_order_options: {
        Args: { p_menu_item: Json; p_options: Json | null };
        Returns: undefined;
      };
      next_order_number: {
        Args: { p_booth_id: string };
        Returns: string;
      };
      assign_order_number: {
        Args: { p_order_id: string };
        Returns: string;
      };
      booth_remaining_stock: {
        Args: { p_booth_id: string };
        Returns: Json;
      };
      booth_servable: {
        Args: { p_booth_id: string };
        Returns: boolean;
      };
      booth_cups_today: {
        Args: { p_booth_id: string };
        Returns: number;
      };
      booth_cups_left: {
        Args: { p_booth_id: string };
        Returns: number | null;
      };
      booth_availability: {
        Args: { p_booth_id: string; p_session: string | null };
        Returns: Json;
      };
      hold_cart: {
        Args: { p_booth_id: string; p_session: string; p_items: Json };
        Returns: Json;
      };
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      set_license_label: {
        Args: { p_license_id: string; p_label: string | null };
        Returns: undefined;
      };
      gen_short_code: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_booth_for_order: {
        Args: {
          p_short_code: string;
        };
        Returns: Json;
      };
      place_order: {
        Args: {
          p_short_code: string;
          p_customer_name: string;
          p_items: Json;
          p_idempotency_key: string;
          p_customer_phone?: string;
        };
        Returns: Json;
      };
      place_walkup_order: {
        Args: {
          p_booth_id: string;
          p_customer_name: string;
          p_items: Json;
          p_paid: boolean;
          p_customer_phone?: string;
        };
        Returns: Json;
      };
      regenerate_short_code: {
        Args: {
          p_booth_id: string;
        };
        Returns: number;
      };
      submit_feedback: {
        Args: {
          p_source: string;
          p_booth_id?: string;
          p_order_number?: string;
          p_access_token?: string;
          p_rating?: number;
          p_nps?: number;
          p_message?: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      order_status: OrderStatus;
      payment_status: PaymentStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Vendor = Database["qkit"]["Tables"]["vendors"]["Row"];
export type Booth = Database["qkit"]["Tables"]["booths"]["Row"];
export type Order = Database["qkit"]["Tables"]["orders"]["Row"];
// The vendor board's shape of an order — access_token is the customer's own
// status-page bearer secret, which the board never reads (least privilege).
export type BoardOrder = Omit<Order, "access_token">;
export type License = Database["qkit"]["Tables"]["licenses"]["Row"];
export type Pricing = Database["qkit"]["Tables"]["pricing"]["Row"];
export type PlatformSettings =
  Database["qkit"]["Tables"]["platform_settings"]["Row"];
export type Payment = Database["qkit"]["Tables"]["payments"]["Row"];
export type Feedback = Database["qkit"]["Tables"]["feedback"]["Row"];
export type Admin = Database["qkit"]["Tables"]["admins"]["Row"];
export type AdminAudit = Database["qkit"]["Tables"]["admin_audit"]["Row"];
export type OrderStatusEvent =
  Database["qkit"]["Tables"]["order_status_events"]["Row"];
