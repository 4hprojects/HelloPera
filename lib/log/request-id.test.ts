import { describe, expect, it, vi } from 'vitest';
import { requestLogFields, resolveRequestId, safeRouteLabel } from './request-id';

describe('request IDs', () => {
  it('keeps a safe upstream request ID', () => {
    expect(resolveRequestId(new Headers({ 'x-request-id': 'edge-01:abc' }))).toBe(
      'edge-01:abc',
    );
  });

  it('replaces an unsafe request ID', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000000',
    );
    expect(resolveRequestId(new Headers({ 'x-request-id': 'bad id value' }))).toBe(
      '00000000-0000-4000-8000-000000000000',
    );
  });

  it('redacts record identifiers from route labels', () => {
    expect(
      safeRouteLabel('/api/documents/123e4567-e89b-12d3-a456-426614174000/original'),
    ).toBe('/api/documents/:id/original');
    expect(safeRouteLabel('/admin/users/12345')).toBe('/admin/users/:id');
  });

  it('adds only safe request IDs to downstream log fields', () => {
    expect(requestLogFields(new Headers({ 'x-request-id': 'edge-123' }))).toEqual({
      request_id: 'edge-123',
    });
    expect(requestLogFields(new Headers({ 'x-request-id': 'bad id' }))).toEqual({});
  });
});
