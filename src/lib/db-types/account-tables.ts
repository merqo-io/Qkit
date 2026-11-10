// Row/Insert/Update shapes for the vendor, admin, billing and feedback tables.
import type { Tier } from "@/lib/plan";
import type { BoardSettings, Json, ToursSeen } from "@/lib/types";

export type AccountTables = {
  vendors: {
    Row: {
      id: string;
      created_at: string;
      tours_seen: ToursSeen;
      board_settings: BoardSettings;
    };
    Insert: {
      id: string;
      created_at?: string;
      tours_seen?: ToursSeen;
      board_settings?: BoardSettings;
    };
    Update: {
      id?: string;
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
  vendor_entitlements: {
    Row: {
      vendor_id: string;
      tier: Tier;
      founder: boolean;
      stats_window: "24h" | "90d";
      event_pass_starts_at: string | null;
      event_pass_ends_at: string | null;
      valid_until: string | null;
      issued_at: string;
      updated_at: string;
    };
    Insert: {
      vendor_id: string;
      tier: Tier;
      founder?: boolean;
      stats_window: "24h" | "90d";
      event_pass_starts_at?: string | null;
      event_pass_ends_at?: string | null;
      valid_until?: string | null;
      issued_at: string;
      updated_at?: string;
    };
    Update: {
      vendor_id?: string;
      tier?: Tier;
      founder?: boolean;
      stats_window?: "24h" | "90d";
      event_pass_starts_at?: string | null;
      event_pass_ends_at?: string | null;
      valid_until?: string | null;
      issued_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  payments: {
    Row: {
      id: string;
      vendor_id: string;
      kind: "pass" | "subscription";
      amount_cents: number;
      source: string;
      note: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      vendor_id: string;
      kind: "pass" | "subscription";
      amount_cents: number;
      source?: string;
      note?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      vendor_id?: string;
      kind?: "pass" | "subscription";
      amount_cents?: number;
      source?: string;
      note?: string | null;
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
    Relationships: [
      {
        foreignKeyName: "feedback_booth_id_fkey";
        columns: ["booth_id"];
        referencedRelation: "booths";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "feedback_vendor_id_fkey";
        columns: ["vendor_id"];
        referencedRelation: "vendors";
        referencedColumns: ["id"];
      },
    ];
  };
};
