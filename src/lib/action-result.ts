/**
 * Discriminated result returned by Server Actions. The success branch carries
 * any extra payload via T (e.g. `{ boothId }` or `{ orderNumber }`); the
 * failure branch always carries a user-facing `error` string.
 */
export type ActionResult<T = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

/**
 * Builds the success branch. Lives here rather than in a "use server" file,
 * which may only export async functions.
 */
export function ok<T extends object = object>(data?: T): { success: true } & T {
  return { ...data, success: true } as { success: true } & T;
}

export function fail(error: string): { success: false; error: string } {
  return { success: false, error };
}
