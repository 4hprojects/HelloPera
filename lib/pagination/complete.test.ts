import { expect, it } from 'vitest';
import { readAllPages } from './complete';
it('reads beyond 1,000 rows including exact page boundaries', async () => {
  const rows = Array.from({ length: 1500 }, (_, id) => ({ id }));
  expect(
    await readAllPages(async (a, b) => ({ data: rows.slice(a, b + 1), error: null })),
  ).toEqual(rows);
});
it('never returns partial totals after a failed page', async () => {
  await expect(
    readAllPages(
      async (a) => (a === 0 ? { data: [1, 2], error: null } : { data: null, error: {} }),
      2,
    ),
  ).rejects.toThrow('could not be loaded');
});
