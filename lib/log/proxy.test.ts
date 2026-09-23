import { describe, expect, it, vi } from 'vitest';
import { serializeProxyRequestLog } from './proxy';

describe('Proxy request logging', () => {
  it('serializes a structured correlation record', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T00:00:00.000Z'));

    expect(
      JSON.parse(
        serializeProxyRequestLog({
          requestId: 'edge-123',
          method: 'GET',
          route: '/documents/:id',
        }),
      ),
    ).toEqual({
      level: 'info',
      message: 'request accepted',
      timestamp: '2026-09-22T00:00:00.000Z',
      request_id: 'edge-123',
      method: 'GET',
      route: '/documents/:id',
    });

    vi.useRealTimers();
  });
});
