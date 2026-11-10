import type { ActionResult } from "@merqo/ui/kit-api";

export type { ActionResult };

/**
 * Builds the success branch. Lives here rather than in a "use server" file,
 * which may only export async functions. The shared package ships the type and
 * `isActionError` but not these builders.
 */
export function ok<T extends object = object>(data?: T): { success: true } & T {
  return { ...data, success: true } as { success: true } & T;
}

export function fail(error: string): { success: false; error: string } {
  return { success: false, error };
}
