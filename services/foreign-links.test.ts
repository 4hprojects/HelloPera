import { beforeEach, expect, it, vi } from 'vitest';

/**
 * Admin-client writers must not store a category or account id the user
 * cannot see. Visibility is answered by the session client (RLS), so the mock
 * returns null for a row that belongs to someone else.
 */
const mocks = vi.hoisted(() => ({
  visible: vi.fn<(table: string, id: string) => unknown>(),
  insert: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          maybeSingle: async () => ({ data: mocks.visible(table, id), error: null }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        mocks.insert(row);
        return {
          select: () => ({ single: async () => ({ data: { id: 'new' }, error: null }) }),
        };
      },
    }),
  }),
}));

import { createBill } from './obligation.service';
import { createRule } from './recurring-rule.service';

const bill = {
  providerName: 'Power',
  description: '',
  amount: '100.00',
  currencyCode: 'PHP',
  dueDate: '2026-11-01',
  notes: '',
} as Parameters<typeof createBill>[1];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.visible.mockReturnValue(null);
});

it("refuses another user's category before inserting", async () => {
  await expect(createBill('me', { ...bill, categoryId: 'theirs' })).rejects.toThrow(
    'CATEGORY_NOT_FOUND',
  );
  expect(mocks.insert).not.toHaveBeenCalled();
});

it('stores a category the user can see', async () => {
  mocks.visible.mockImplementation((table) =>
    table === 'categories' ? { id: 'system' } : null,
  );
  await expect(createBill('me', { ...bill, categoryId: 'system' })).resolves.toBe('new');
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({ user_id: 'me', category_id: 'system' }),
  );
});

it('skips the check when no category is chosen', async () => {
  await expect(createBill('me', { ...bill, categoryId: null })).resolves.toBe('new');
  expect(mocks.visible).not.toHaveBeenCalled();
});

it("refuses a recurring rule on another user's account", async () => {
  await expect(
    createRule(
      'me',
      { accountId: 'theirs', categoryId: null } as Parameters<typeof createRule>[1],
      '2026-10-07',
    ),
  ).rejects.toThrow('ACCOUNT_NOT_FOUND');
  expect(mocks.insert).not.toHaveBeenCalled();
});
