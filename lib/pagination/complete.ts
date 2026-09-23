/** Complete reads for authoritative totals. Never return a silently capped total. */
export async function readAllPages<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  pageSize = 500,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const { data, error } = await read(offset, offset + pageSize - 1);
    if (error) throw new Error('Records could not be loaded. Please try again.');
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error(
    'Too many records to calculate a complete total. Narrow the date range.',
  );
}
