import { afterEach, describe, expect, it, vi } from 'vitest';

const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
};

async function loadEnv(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...REQUIRED, ...overrides })) {
    if (value === undefined) vi.stubEnv(key, undefined);
    else vi.stubEnv(key, value);
  }
  return import('./index');
}

describe('provider environment validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('allows provider-backed features to remain unconfigured', async () => {
    const envModule = await loadEnv({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined,
      VAPID_PRIVATE_KEY: undefined,
      VAPID_SUBJECT: undefined,
      SCHEDULER_SECRET: undefined,
    });

    expect(envModule.isPushConfigured()).toBe(false);
    expect(envModule.isSchedulerConfigured()).toBe(false);
  });

  it('rejects a partial VAPID configuration', async () => {
    await expect(
      loadEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'p'.repeat(87) }),
    ).rejects.toThrow('All three VAPID values must be configured together');
  });

  it('rejects a short scheduler secret', async () => {
    await expect(loadEnv({ SCHEDULER_SECRET: 'too-short' })).rejects.toThrow(
      'SCHEDULER_SECRET',
    );
  });
});
