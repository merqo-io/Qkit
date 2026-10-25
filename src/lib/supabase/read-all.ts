/** Read a deterministically ordered query without silently truncating at the API row cap. */
export async function readAllRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  while (true) {
    const { data, error } = await page(rows.length, rows.length + 999);
    if (error || !data) {
      console.error("readAllRows: page failed", error?.message ?? "no data");
      throw new Error("Could not load complete query results");
    }
    if (data.length === 0) return rows;
    rows.push(...data);
  }
}
