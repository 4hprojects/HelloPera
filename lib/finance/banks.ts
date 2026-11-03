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
 * A readable default for the account name: "BDO Savings", or "BDO" when no
 * kind is chosen. Empty until a bank is chosen.
 *
 * Never the last 4 digits (HP-038). The name is copied into audit rows and
 * exports, and the accounts list already shows the digits from
 * `account_details`, so a name holding them spread them further and showed
 * them twice.
 */
export function suggestAccountName(bank: string, kind: string): string {
  const name = bank.trim();
  if (!name) return '';
  const label = BANK_KIND_LABELS[kind as BankKind];
  return label ? `${name} ${label}` : name;
}
