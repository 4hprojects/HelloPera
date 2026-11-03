import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ readFlagStrict: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/services/plan.service', () => ({ readFlagStrict: m.readFlagStrict }));

import {
  assertWritesEnabled,
  isMaintenanceMode,
  WritesDisabledError,
} from '@/lib/ops/kill-switches';

/**
 * PHASE-14 §22, §85 — "every kill switch works, exercised at least once."
 *
 * `isMaintenanceMode` is tested here because it is pure and because its
 * failure mode is asymmetric: reading a value as "on" when it is not takes the
 * whole site down, while reading it as "off" merely fails to.
 *
 * The other half of §85 — that the site actually serves a 503 and that the
 * health probe stays up — is a running-server check, recorded in
 * `docs/PHASE-14-NOTES.md` rather than asserted here, because it needs a built
 * application rather than a module.
 */

const original = process.env.MAINTENANCE_MODE;

afterEach(() => {
  if (original === undefined) delete process.env.MAINTENANCE_MODE;
  else process.env.MAINTENANCE_MODE = original;
  vi.restoreAllMocks();
});

describe('maintenance mode reads only an explicit yes', () => {
  it('is on for the two affirmative spellings', () => {
    for (const value of ['1', 'true']) {
      process.env.MAINTENANCE_MODE = value;
      expect(isMaintenanceMode(), value).toBe(true);
    }
  });

  it('is off when unset', () => {
    delete process.env.MAINTENANCE_MODE;
    expect(isMaintenanceMode()).toBe(false);
  });

  it('is off for every value that is not an explicit yes', () => {
    // The failure that matters: a platform that sets MAINTENANCE_MODE=false,
    // or leaves it empty, must not take the site down. A truthiness check on
    // the raw string would do exactly that for "false".
    for (const value of ['', 'false', '0', 'no', 'off', 'FALSE', 'yes', 'TRUE']) {
      process.env.MAINTENANCE_MODE = value;
      expect(isMaintenanceMode(), JSON.stringify(value)).toBe(false);
    }
  });
});

describe('financial writes switch (HP-025)', () => {
  it('allows a write while the flag is on', async () => {
    m.readFlagStrict.mockResolvedValue(true);
    await expect(assertWritesEnabled()).resolves.toBeUndefined();
    expect(m.readFlagStrict).toHaveBeenCalledWith('financial_writes_enabled');
  });

  it('refuses a write while the flag is off', async () => {
    m.readFlagStrict.mockResolvedValue(false);
    await expect(assertWritesEnabled()).rejects.toBeInstanceOf(WritesDisabledError);
  });

  it('refuses a write when the flag cannot be read', async () => {
    m.readFlagStrict.mockRejectedValue(new Error('missing'));
    await expect(assertWritesEnabled()).rejects.toBeInstanceOf(WritesDisabledError);
  });
});
