import { describe, expect, it } from 'vitest';
import { suggestAccountName } from '@/lib/finance/banks';

describe('suggestAccountName', () => {
  it('is empty until a bank is chosen', () => {
    expect(suggestAccountName('', 'savings')).toBe('');
    expect(suggestAccountName('  ', '')).toBe('');
  });

  it('uses the kind, then the bank alone', () => {
    expect(suggestAccountName('BPI', 'checking')).toBe('BPI Checking');
    expect(suggestAccountName('BPI', '')).toBe('BPI');
  });

  it('never carries account digits into the name', () => {
    expect(suggestAccountName('BDO', 'savings')).not.toMatch(/\d/);
  });
});
