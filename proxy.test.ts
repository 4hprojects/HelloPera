import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

const { createServerClient, getUser } = vi.hoisted(() => {
  const getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
  return {
    getUser,
    createServerClient: vi.fn(() => ({ auth: { getUser } })),
  };
});

const { logProxyRequest } = vi.hoisted(() => ({ logProxyRequest: vi.fn() }));

vi.mock('@supabase/ssr', () => ({ createServerClient }));
vi.mock('@/lib/log/proxy', () => ({ logProxyRequest }));

import { config, proxy } from './proxy';

describe('proxy route matching', () => {
  it.each(['/', '/login', '/dashboard', '/admin/users', '/api/export', '/api/health'])(
    'runs for application route %s',
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    },
  );

  it.each([
    '/_next/static/chunks/app.js',
    '/_next/image?url=%2Flogo.png&w=128&q=75',
    '/favicon.ico',
    '/icons/icon-192.png',
    '/manifest.webmanifest',
    '/robots.txt',
    '/sitemap.xml',
    '/ads.txt',
    '/sw.js',
    '/opengraph-image.png',
    '/receipt-preview.webp',
  ])('skips static or crawler route %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });
});

describe('proxy behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MAINTENANCE_MODE', 'false');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  });

  it('validates the current user to refresh the session', async () => {
    const response = await proxy(
      new NextRequest('https://hellopera.test/dashboard', {
        headers: { 'x-request-id': 'edge-request-123' },
      }),
    );

    expect(createServerClient).toHaveBeenCalledOnce();
    expect(getUser).toHaveBeenCalledOnce();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('x-request-id')).toBe('edge-request-123');
    expect(response.headers.get('x-middleware-request-x-request-id')).toBe(
      'edge-request-123',
    );
    expect(logProxyRequest).toHaveBeenCalledWith({
      requestId: 'edge-request-123',
      method: 'GET',
      route: '/dashboard',
    });
  });

  it('returns maintenance before making a Supabase request', async () => {
    vi.stubEnv('MAINTENANCE_MODE', 'true');

    const response = await proxy(new NextRequest('https://hellopera.test/dashboard'));

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('600');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    await expect(response.text()).resolves.toContain('HelloPera is back shortly');
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('keeps the health endpoint available during maintenance', async () => {
    vi.stubEnv('MAINTENANCE_MODE', 'true');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const response = await proxy(new NextRequest('https://hellopera.test/api/health'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
