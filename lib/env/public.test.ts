import { afterEach, describe, expect, it, vi } from 'vitest';

function jwt(claims: object): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.sig`;
}

async function loadPublicEnv(anonKey: string) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', anonKey);
  return import('./public');
}

describe('browser-safe environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reads the role claim without Buffer', async () => {
    const { readJwtRole } = await loadPublicEnv('sb_publishable_test');
    expect(readJwtRole(jwt({ role: 'anon' }))).toBe('anon');
    expect(readJwtRole('not-a-jwt')).toBeNull();
  });

  it('accepts a publishable key', async () => {
    const { publicEnv } = await loadPublicEnv('sb_publishable_test');
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('sb_publishable_test');
  });

  it.each([jwt({ role: 'service_role' }), 'sb_secret_test'])(
    'refuses a secret key behind NEXT_PUBLIC_ (%s)',
    async (key) => {
      await expect(loadPublicEnv(key)).rejects.toThrow('must never reach the browser');
    },
  );
});
