/** Split a page-size-plus-one query into display rows and a next-page signal. */
export function takeLookaheadPage<T>(rows: readonly T[], pageSize: number) {
  return {
    items: rows.slice(0, pageSize),
    hasNext: rows.length > pageSize,
  };
}
