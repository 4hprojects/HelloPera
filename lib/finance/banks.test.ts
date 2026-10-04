import { describe, expect, it } from 'vitest';
import { suggestAccountName } from '@/lib/finance/banks';

describe('suggestAccountName', () => {
  it('is empty until a bank is chosen', () => {
    expect(suggestAccountName('', 'savings', '1234')).toBe('');
    expect(suggestAccountName('  ', '', '')).toBe('');
  });

  it('prefers the last 4 digits', () => {
    expect(suggestAccountName('BDO', 'savings', '1234')).toBe('BDO ••1234');
  });

  it('falls back to the kind, then the bank alone', () => {
    expect(suggestAccountName('BPI', 'checking', '')).toBe('BPI Checking');
    expect(suggestAccountName('BPI', '', '')).toBe('BPI');
  });

  it('ignores incomplete or non-numeric digits', () => {
    expect(suggestAccountName('BDO', 'savings', '12')).toBe('BDO Savings');
    expect(suggestAccountName('BDO', '', '12a4')).toBe('BDO');
  });
});
