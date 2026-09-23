import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  deleteUser: vi.fn(),
  rpc: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => ({ update: () => ({ eq: mocks.eq }) }),
    storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) },
    auth: { admin: { deleteUser: mocks.deleteUser } },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/services/storage.service', () => ({ BUCKET: 'test' }));
vi.mock('@/lib/billing/provider', () => ({
  getBillingProvider: () => ({ isLive: false }),
}));
import { deleteAccount } from './account-deletion.service';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.eq.mockResolvedValue({ error: null });
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
});
it('does not touch files when reauthentication was rejected', async () => {
  mocks.rpc.mockResolvedValue({ error: {} });
  await expect(deleteAccount('a', 'hash')).rejects.toThrow('verify your identity');
  expect(mocks.list).not.toHaveBeenCalled();
});
it('reports partial deletion truthfully and retries safely', async () => {
  mocks.list
    .mockResolvedValueOnce({
      data: Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: String(i) })),
    })
    .mockResolvedValueOnce({ data: [{ id: 'last', name: 'last' }] });
  mocks.remove
    .mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ error: {} });
  await expect(deleteAccount('a')).rejects.toThrow('some files may already be removed');
  expect(mocks.deleteUser).not.toHaveBeenCalled();
  await deleteAccount('a');
  expect(mocks.deleteUser).toHaveBeenCalledWith('a');
});
it('reports files removed when auth deletion fails', async () => {
  mocks.list.mockResolvedValue({ data: [{ id: 'one', name: 'one' }] });
  mocks.deleteUser.mockResolvedValue({ error: {} });
  await expect(deleteAccount('a')).rejects.toThrow('Your files were removed');
  expect(mocks.remove).toHaveBeenCalledWith(['a/one']);
});
