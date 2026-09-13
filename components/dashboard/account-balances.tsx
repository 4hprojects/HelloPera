import Link from 'next/link';
import { Amount } from '@/components/finance/amount';
import { Icon, type IconName } from '@/components/icons';
import { IconChip, SectionCard, type ChipTone } from '@/components/ui/card';
import type { AccountBalance } from '@/types/dashboard';

/**
 * Account balances — §47: name, type, balance and currency.
 *
 * Archived accounts are excluded (§26, §47); the service still loads them so
 * historical transactions elsewhere can resolve a name. Liabilities render in
 * the warning tone as a positive amount owed (§10), never as negative assets.
 */
const TYPE_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank',
  gcash: 'GCash',
  maya: 'Maya',
  paypal: 'PayPal',
  credit_card: 'Credit card',
  loan: 'Loan',
  investment: 'Investment',
  other: 'Other',
};

const TYPE_ICON: Record<string, { icon: IconName; tone: ChipTone }> = {
  cash: { icon: 'wallet', tone: 'success' },
  bank: { icon: 'accounts', tone: 'primary' },
  gcash: { icon: 'wallet', tone: 'primary' },
  maya: { icon: 'wallet', tone: 'primary' },
  paypal: { icon: 'wallet', tone: 'primary' },
  credit_card: { icon: 'accounts', tone: 'warning' },
  loan: { icon: 'bills', tone: 'warning' },
  investment: { icon: 'analytics', tone: 'success' },
  other: { icon: 'wallet', tone: 'neutral' },
};

const VISIBLE = 6;

export function AccountBalances({
  accounts,
  total,
}: {
  accounts: AccountBalance[];
  total: number;
}) {
  const shown = accounts.slice(0, VISIBLE);

  return (
    <SectionCard
      title="Accounts"
      action={
        <Link href="/accounts" className="hp-small font-semibold text-primary-text">
          View all
        </Link>
      }
      bodyClassName="-mt-1"
    >
      {shown.length === 0 ? (
        <p className="hp-body py-6 text-center text-text-muted">No active accounts.</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {shown.map((a) => {
              const chip = TYPE_ICON[a.type] ?? TYPE_ICON.other!;
              return (
                <li key={a.id} className="flex items-center gap-3 py-3">
                  <IconChip tone={chip.tone} size={38}>
                    <Icon name={chip.icon} size={18} />
                  </IconChip>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{a.name}</p>
                    <p className="hp-small truncate text-text-muted">
                      {TYPE_LABELS[a.type] ?? a.type}
                      {a.institution ? ` · ${a.institution}` : ''} · {a.currency}
                    </p>
                  </div>
                  <Amount
                    value={a.balance}
                    tone={a.nature === 'liability' ? 'liability' : undefined}
                    className="shrink-0"
                  />
                </li>
              );
            })}
          </ul>
          {total > VISIBLE ? (
            <p className="hp-small mt-3 text-text-muted">
              and {total - VISIBLE} more —{' '}
              <Link href="/accounts" className="font-semibold text-primary-text">
                view all
              </Link>
            </p>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
