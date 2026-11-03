import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => m.headers }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { clientIp } from './rate-limit.service';

const original = process.env.TRUSTED_CLIENT_IP_HEADER;
afterEach(() => {
  if (original === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER;
  else process.env.TRUSTED_CLIENT_IP_HEADER = original;
});

const set = (entries: Record<string, string>) => {
  m.headers = new Headers(entries);
};

describe('clientIp (HP-015)', () => {
  it('prefers Cloudflare, then the first forwarded hop, then x-real-ip', async () => {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    set({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2, 3.3.3.3' });
    expect(await clientIp()).toBe('1.1.1.1');
    set({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3', 'x-real-ip': '4.4.4.4' });
    expect(await clientIp()).toBe('2.2.2.2');
    set({ 'x-real-ip': '4.4.4.4' });
    expect(await clientIp()).toBe('4.4.4.4');
    set({});
    expect(await clientIp()).toBe('unknown');
  });

  it('trusts only the configured header when the origin is locked', async () => {
    process.env.TRUSTED_CLIENT_IP_HEADER = 'CF-Connecting-IP';
    set({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' });
    expect(await clientIp()).toBe('1.1.1.1');
    // A spoofed fallback header is not used when the trusted one is absent.
    set({ 'x-forwarded-for': '9.9.9.9', 'x-real-ip': '8.8.8.8' });
    expect(await clientIp()).toBe('unknown');
  });
});
