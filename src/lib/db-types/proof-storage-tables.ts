// Row/Insert/Update shapes for the proof-storage deletion queue (0119).
export type ProofStorageTables = {
  proof_storage_deletions: {
    Row: {
      id: number;
      bucket: string;
      path: string;
      queued_at: string;
      attempts: number;
      last_error: string | null;
    };
    Insert: {
      id?: number;
      bucket: string;
      path: string;
      queued_at?: string;
      attempts?: number;
      last_error?: string | null;
    };
    Update: {
      id?: number;
      bucket?: string;
      path?: string;
      queued_at?: string;
      attempts?: number;
      last_error?: string | null;
    };
    Relationships: [];
  };
};
