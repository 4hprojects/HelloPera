import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reuseFor } from './reuse-for';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('reuseFor', () => {
  it('runs once for callers inside the window, then again after it', async () => {
    const work = vi.fn(async () => 'ok');
    const probe = reuseFor(1000, work);
    await Promise.all([probe(), probe(), probe()]);
    await probe();
    expect(work).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1001);
    await probe();
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('shares a run that is still in progress', async () => {
    let finish!: (v: string) => void;
    const work = vi.fn(() => new Promise<string>((r) => (finish = r)));
    const probe = reuseFor(1000, work);
    const a = probe();
    vi.advanceTimersByTime(5000);
    const b = probe();
    finish('done');
    await expect(Promise.all([a, b])).resolves.toEqual(['done', 'done']);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failure', async () => {
    const work = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce('up');
    const probe = reuseFor(1000, work);
    await expect(probe()).rejects.toThrow('down');
    await expect(probe()).resolves.toBe('up');
  });
});
