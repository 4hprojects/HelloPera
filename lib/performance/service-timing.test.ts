import { afterEach, describe, expect, it, vi } from 'vitest';
import { withServiceTiming } from './service-timing';

describe('withServiceTiming', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs duration and aggregate result fields', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(142.4);

    const result = await withServiceTiming('transactions.list', async () => [1, 2], {
      fields: { page: 1 },
      resultFields: (rows) => ({ row_count: rows.length }),
    });

    expect(result).toEqual([1, 2]);
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
      level: 'info',
      message: 'service timing',
      operation: 'transactions.list',
      status: 'ok',
      duration_ms: 42,
      page: 1,
      row_count: 2,
    });
  });

  it('logs failure metadata and rethrows the original error', async () => {
    const output = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(15);
    const failure = new TypeError('query failed');

    await expect(
      withServiceTiming('documents.list', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
      operation: 'documents.list',
      status: 'error',
      duration_ms: 5,
      error_type: 'TypeError',
    });
  });
});
