import { z } from "zod";
import type { PlaceOrderInput } from "@/lib/schemas";

const pendingOrderSchema = z
  .object({
    key: z.uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type PendingOrder = z.infer<typeof pendingOrderSchema>;
const storageKey = (boothId: string) => `qkit:pending-order:${boothId}`;

export class RecoveryStorageError extends Error {
  constructor() {
    super("Order recovery storage is unavailable");
  }
}

/** Persist only an opaque replay key and payload digest, never customer details. */
export function loadPendingOrder(boothId: string): PendingOrder | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(storageKey(boothId));
  } catch {
    throw new RecoveryStorageError();
  }
  return raw === null ? null : pendingOrderSchema.parse(JSON.parse(raw));
}

export function savePendingOrder(boothId: string, pending: PendingOrder): void {
  const raw = JSON.stringify(pendingOrderSchema.parse(pending));
  try {
    window.sessionStorage.setItem(storageKey(boothId), raw);
  } catch {
    throw new RecoveryStorageError();
  }
}

export function clearPendingOrder(boothId: string): void {
  window.sessionStorage.removeItem(storageKey(boothId));
}

/** Normalize cart ordering so restored carts recover the same logical request. */
export async function orderFingerprint(
  input: PlaceOrderInput,
): Promise<string> {
  const items = input.items
    .map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      options: (item.options ?? [])
        .map((option) => ({ group: option.group, choice: option.choice }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const payload = JSON.stringify({
    customerName: input.customerName,
    customerPhone: input.customerPhone ?? "",
    items,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
