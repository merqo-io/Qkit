// Argument/return shapes for the qkit schema's Postgres functions.
import type { Tier } from "@/lib/plan";
import type { Json } from "@/lib/types";

export type DbFunctions = {
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
  vendor_cups_between: {
    Args: { p_vendor_id: string; p_from: string; p_to: string };
    Returns: number;
  };
  purge_order_idempotency_keys: {
    Args: Record<string, never>;
    Returns: number;
  };
  start_new_service: {
    Args: { p_booth_id: string };
    Returns: boolean;
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
  apply_vendor_entitlement: {
    Args: {
      p_vendor: string;
      p_tier: Tier;
      p_founder: boolean;
      p_stats_window: "24h" | "90d";
      p_event_pass_starts_at: string | null;
      p_event_pass_ends_at: string | null;
      p_valid_until: string | null;
      p_issued_at: string;
    };
    Returns: boolean;
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
      p_paid?: boolean;
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
  apply_order_stock_delta: {
    Args: { p_booth_id: string; p_items: Json; p_sign: number };
    Returns: undefined;
  };
  booth_open: {
    Args: { p_hours: Json; p_now: string };
    Returns: boolean;
  };
  can_create_booth: {
    Args: { p_vendor: string };
    Returns: boolean;
  };
  order_item_quantities: {
    Args: { p_items: Json };
    Returns: { menu_item_id: string; qty: number }[];
  };
  purge_ops_events: {
    Args: Record<string, never>;
    Returns: undefined;
  };
  sweep_stale_orders: {
    Args: Record<string, never>;
    Returns: undefined;
  };
  vendor_effective_tier: {
    Args: { p_vendor: string };
    Returns: string;
  };
  vendor_entitled: {
    Args: { p_vendor: string };
    Returns: boolean;
  };
  vendor_has_free_caps: {
    Args: { p_vendor: string };
    Returns: boolean;
  };
  vendor_pass_running: {
    Args: { p_vendor: string };
    Returns: boolean;
  };
};
