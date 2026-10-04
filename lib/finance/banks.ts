/** Common Philippine banks for the account picker. `Other` falls back to free text. */
export const PH_BANKS = [
  'BDO',
  'BPI',
  'Metrobank',
  'UnionBank',
  'Landbank',
  'PNB',
  'Security Bank',
  'RCBC',
  'China Bank',
  'EastWest',
  'Maybank',
  'GoTyme',
  'Maya Bank',
  'CIMB',
  'SeaBank',
  'Tonik',
  'Maribank',
] as const;

export const OTHER_BANK = '__other';

export const BANK_KINDS = ['savings', 'checking', 'time_deposit'] as const;
export type BankKind = (typeof BANK_KINDS)[number];

export const BANK_KIND_LABELS: Record<BankKind, string> = {
  savings: 'Savings',
  checking: 'Checking',
  time_deposit: 'Time deposit',
};

/**
 * A readable default for the account name: "BDO ••1234", or "BDO Savings"
 * when there are no digits yet. Empty until a bank is chosen.
 */
export function suggestAccountName(bank: string, kind: string, last4: string): string {
  const name = bank.trim();
  if (!name) return '';
  if (/^\d{4}$/.test(last4)) return `${name} ••${last4}`;
  const label = BANK_KIND_LABELS[kind as BankKind];
  return label ? `${name} ${label}` : name;
}
