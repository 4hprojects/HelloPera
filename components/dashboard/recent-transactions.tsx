import Link from 'next/link';
import { Amount } from '@/components/finance/amount';
import { Icon, type IconName } from '@/components/icons';
import { IconChip, SectionCard, type ChipTone } from '@/components/ui/card';
import type { RecentTransactionView } from '@/types/dashboard';

/**
 * The latest confirmed transactions — §16.
 *
 * Confirmed only, per §4 and §16: a voided row is not part of the record and
 * has no business on the dashboard. Each row carries date, type, merchant,
 * category and account, which is §16's recommended field set.
 */
const TYPE_CHIP: Record<string, { icon: IconName; tone: ChipTone }> = {
  income: { icon: 'income', tone: 'success' },
  expense: { icon: 'expense', tone: 'danger' },
  refund: { icon: 'income', tone: 'gold' },
  transfer: { icon: 'transfer', tone: 'primary' },
  adjustment: { icon: 'settings', tone: 'neutral' },
  opening_balance: { icon: 'wallet', tone: 'neutral' },
};

export function RecentTransactions({ items }: { items: RecentTransactionView[] }) {
  return (
    <SectionCard
      title="Recent transactions"
      action={
        <Link href="/transactions" className="hp-small font-semibold text-primary-text">
          View all
        </Link>
      }
      bodyClassName="-mt-1"
    >
      {items.length === 0 ? (
        <p className="hp-body py-6 text-center text-text-muted">
          Record an expense, income or transfer to see it here.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((tx) => {
            const chip = TYPE_CHIP[tx.type] ?? TYPE_CHIP.adjustment!;
            const meta = [tx.typeLabel, tx.categoryLabel, tx.accountLabel]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={tx.id} className="flex items-center gap-3 py-3">
                <IconChip tone={chip.tone} size={38}>
                  <Icon name={chip.icon} size={18} />
                </IconChip>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">
                    {tx.merchant}
                  </p>
                  <p className="hp-small truncate text-text-muted">{meta}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Amount
                    value={tx.amount}
                    tone={tx.analytics}
                    showSign={tx.analytics !== 'neutral'}
                    className="block"
                  />
                  <p className="hp-small text-text-muted">{tx.date}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
