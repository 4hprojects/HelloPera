import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc, from }) }));

import {
  getAdminOverview,
  getAiOverview,
  getNotificationOverview,
  listJobRuns,
} from '@/services/admin.service';

const failing = { data: null, error: { code: '57014', message: 'timeout' } };

beforeEach(() => {
  vi.clearAllMocks();
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'gte', 'neq', 'eq', 'order']) chain[m] = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(failing));
  from.mockReturnValue(chain);
});

describe('admin reads report unavailable, never zero', () => {
  it('overview', async () => {
    rpc.mockResolvedValue(failing);
    const result = await getAdminOverview();
    expect(result.state).toBe('unavailable');
    if (result.state === 'unavailable') expect(result.reference).toMatch(/^adm-/);
  });

  it('ai overview, notifications and job runs', async () => {
    rpc.mockResolvedValue(failing);
    expect((await getAiOverview(true)).state).toBe('unavailable');
    expect((await getNotificationOverview()).state).toBe('unavailable');
    expect((await listJobRuns()).state).toBe('unavailable');
  });

  it('maps exact database totals through unchanged', async () => {
    rpc.mockResolvedValue({
      data: {
        users_total: 1500,
        users_active: 1400,
        users_suspended: 60,
        users_disabled: 40,
        admins: 2,
        ocr_today: 0,
        ocr_failed: 0,
        ai_today: 1200,
        ai_failed: 300,
        notifications_pending: 1000,
        notifications_failed: 500,
        jobs_last_run_at: null,
        jobs_failed: 3,
      },
      error: null,
    });
    const result = await getAdminOverview();
    expect(result.state).toBe('ok');
    if (result.state === 'ok') {
      expect(result.data.users.total).toBe(1500);
      expect(result.data.notifications.pending).toBe(1000);
      expect(result.data.jobs).toEqual({
        lastRunAt: null,
        failedInWindow: 3,
        windowHours: 24,
      });
    }
  });
});
