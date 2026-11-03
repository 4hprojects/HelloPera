import { beforeEach, describe, expect, it, vi } from 'vitest';
import { draftRequestId } from '@/lib/ocr/drafts';

const m = vi.hoisted(() => ({
  extraction: null as unknown,
  rpc: vi.fn(),
  createBill: vi.fn(),
  createReceivable: vi.fn(),
  createExpectedIncome: vi.fn(),
  createTransaction: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => ({ user: { id: 'user-1' }, profile: {} }),
}));
vi.mock('@/services/plan.service', () => ({ isFlagEnabled: async () => true }));
vi.mock('@/lib/ops/kill-switches', () => ({
  assertWritesEnabled: async () => undefined,
  WritesDisabledError: class extends Error {},
}));
vi.mock('@/services/ocr.service', () => ({
  OcrError: class extends Error {},
  runExtraction: vi.fn(),
}));
vi.mock('@/services/usage.service', () => ({ UsageLimitError: class extends Error {} }));
vi.mock('@/services/account.service', () => ({ getAccount: async () => null }));
vi.mock('@/services/transaction.service', () => ({
  createTransaction: m.createTransaction,
  TransactionError: class extends Error {},
}));
vi.mock('@/services/obligation.service', () => ({
  createBill: m.createBill,
  createReceivable: m.createReceivable,
  createExpectedIncome: m.createExpectedIncome,
}));
vi.mock('@/lib/supabase/admin', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: m.extraction, error: null }),
  };
  return { createAdminClient: () => ({ from: () => chain, rpc: m.rpc }) };
});

import { confirmDraftsAction } from './extraction';

const EX = '00000000-0000-4000-8000-000000000001';

function pending(saved: Record<string, unknown> = {}, drafts = 2) {
  return {
    status: 'pending_review',
    structured_data: { drafts: Array.from({ length: drafts }, () => ({})) },
    corrected_data: { saved },
  };
}

function billDraft(index = 0, extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  f.set('extractionId', EX);
  f.set('documentId', 'doc-1');
  f.set('count', '2');
  f.set('currency', 'php');
  const fields = {
    selected: 'on',
    target: 'bill',
    name: 'Meralco',
    amount: '1250.50',
    date: '2026-11-20',
    ...extra,
  };
  for (const [k, v] of Object.entries(fields)) f.set(`d${index}.${k}`, v);
  return f;
}

const anyCreate = () =>
  m.createBill.mock.calls.length +
  m.createReceivable.mock.calls.length +
  m.createExpectedIncome.mock.calls.length +
  m.createTransaction.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  m.extraction = pending();
  m.createBill.mockResolvedValue('bill-id');
  m.rpc.mockResolvedValue({ data: {}, error: null });
});

describe('confirmDraftsAction', () => {
  it('creates nothing for an extraction this user does not own', async () => {
    m.extraction = null;
    const state = await confirmDraftsAction({}, billDraft());
    expect(state.error).toMatch(/could not be found/);
    expect(anyCreate()).toBe(0);
  });

  it('creates nothing once the extraction is confirmed or discarded', async () => {
    m.extraction = { ...pending(), status: 'confirmed' };
    const state = await confirmDraftsAction({}, billDraft());
    expect(state.error).toMatch(/already saved or discarded/);
    expect(anyCreate()).toBe(0);
  });

  it('skips a draft that was already saved instead of creating it again', async () => {
    m.extraction = pending({ '0': { type: 'bill', id: 'bill-id' } });
    const state = await confirmDraftsAction({}, billDraft());
    expect(state.results).toEqual([
      { index: 0, ok: false, message: 'Already saved earlier.' },
    ]);
    expect(anyCreate()).toBe(0);
  });

  it('refuses a target that is not a record type', async () => {
    for (const target of ['unknown', 'account', '']) {
      const state = await confirmDraftsAction({}, billDraft(0, { target }));
      expect(state.results?.[0]?.message).toBe('Choose what this record is.');
    }
    expect(anyCreate()).toBe(0);
  });

  it('refuses an index beyond the drafts that were read', async () => {
    m.extraction = pending({}, 1);
    const state = await confirmDraftsAction({}, billDraft(1));
    expect(state.results?.[0]?.message).toBe('This record is no longer here.');
    expect(anyCreate()).toBe(0);
  });

  it('refuses a malformed currency before creating anything', async () => {
    const f = billDraft();
    f.set('currency', 'p$');
    const state = await confirmDraftsAction({}, f);
    expect(state.error).toBe('Choose a valid currency.');
    expect(anyCreate()).toBe(0);
  });

  it('creates under the id derived from the draft, so a retry finds the same record', async () => {
    const id = draftRequestId(EX, 0);
    m.createBill.mockResolvedValue(id);
    const state = await confirmDraftsAction({}, billDraft());

    expect(state.success).toBe('Saved 1 record.');
    expect(m.createBill).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ amount: '1250.50', currencyCode: 'PHP' }),
      { id },
    );
    expect(m.rpc).toHaveBeenCalledWith(
      'confirm_extraction_draft',
      expect.objectContaining({
        p_draft_index: 0,
        p_entity_type: 'bill',
        p_entity_id: id,
      }),
    );
  });
});
