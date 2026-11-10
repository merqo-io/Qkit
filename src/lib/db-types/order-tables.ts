// Row/Insert/Update shapes for the booth and order tables.
import type {
  Json,
  OrderSource,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  PrintStatus,
} from "@/lib/types";

export type OrderTables = {
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
      cap_reset_at: string | null;
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
      cap_reset_at?: string | null;
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
      cap_reset_at?: string | null;
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
      order_number?: string | null;
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
    Relationships: [
      {
        foreignKeyName: "booth_item_sold_booth_id_fkey";
        columns: ["booth_id"];
        referencedRelation: "booths";
        referencedColumns: ["id"];
      },
    ];
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
  // Migration 0110: one row per "Start new service"; vendors read their
  // own booths' rows, writes only through qkit.start_new_service.
  booth_service_starts: {
    Row: {
      id: number;
      booth_id: string;
      started_at: string;
    };
    Insert: {
      // GENERATED ALWAYS AS IDENTITY: inserts and updates may not set it.
      id?: never;
      booth_id: string;
      started_at?: string;
    };
    Update: {
      id?: never;
      booth_id?: string;
      started_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: "booth_service_starts_booth_id_fkey";
        columns: ["booth_id"];
        referencedRelation: "booths";
        referencedColumns: ["id"];
      },
    ];
  };
  // Service-role only (migration 0108): select + insert, 30-day purge.
  ops_events: {
    Row: {
      id: number;
      vendor_id: string;
      kind: "webhook_rejected" | "action_error";
      ref: string;
      code: string;
      created_at: string;
    };
    Insert: {
      id?: never;
      vendor_id: string;
      kind: "webhook_rejected" | "action_error";
      ref: string;
      code: string;
      created_at?: string;
    };
    Update: {
      id?: never;
      vendor_id?: string;
      kind?: "webhook_rejected" | "action_error";
      ref?: string;
      code?: string;
      created_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: "ops_events_vendor_id_fkey";
        columns: ["vendor_id"];
        referencedRelation: "vendors";
        referencedColumns: ["id"];
      },
    ];
  };
  // Service-role only (migration 0096): short-lived reservations of cart stock.
  cart_holds: {
    Row: {
      booth_id: string;
      session_id: string;
      items: Json;
      qty: number;
      expires_at: string;
    };
    Insert: {
      booth_id: string;
      session_id: string;
      items: Json;
      qty: number;
      expires_at: string;
    };
    Update: {
      booth_id?: string;
      session_id?: string;
      items?: Json;
      qty?: number;
      expires_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: "cart_holds_booth_id_fkey";
        columns: ["booth_id"];
        referencedRelation: "booths";
        referencedColumns: ["id"];
      },
    ];
  };
  // Fixed-window counters behind qkit.check_rate_limit (migration 0017).
  rate_limits: {
    Row: { key: string; window_start: string; count: number };
    Insert: { key: string; window_start: string; count?: number };
    Update: { key?: string; window_start?: string; count?: number };
    Relationships: [];
  };
};
