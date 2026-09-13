import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { buttonClass } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';
import type { RecurringRule, RuleStatus } from '@/types/recurring';
import type { RuleType } from '@/schemas/recurring.schema';

/**
 * §48 — the rule list: name, type, amount, frequency, next occurrence, status.
 */

const STATUS: Record<
  RuleStatus,
  { label: string; tone: 'success' | 'warning' | 'neutral' }
> = {
  active: { label: 'Active', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  ended: { label: 'Ended', tone: 'neutral' },
};

const TYPE_LABEL: Record<RuleType, string> = {
  income: 'Income',
  expense: 'Expense',
  bill: 'Bill',
  expected_income: 'Expected income',
};

export function RuleList({ rules }: { rules: RecurringRule[] }) {
  if (!rules.length) {
    return (
      <EmptyState
        title="No recurring rules yet"
        description="Rent, salary, a subscription — anything that repeats on a schedule."
        action={
          <Link href="/recurring/new" className={buttonClass('primary', 'sm')}>
            Add your first rule
          </Link>
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {rules.map((rule) => {
        const status = STATUS[rule.status];
        return (
          <li key={rule.id}>
            <Link
              href={`/recurring/${rule.id}`}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-hp)] py-3 transition-colors hover:bg-surface-raised"
            >
              <div className="min-w-0">
                <p className="hp-body truncate font-medium text-text">{rule.name}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {TYPE_LABEL[rule.ruleType]} · {rule.cadence}
                  {rule.status === 'active' && rule.nextOccurrenceDate
                    ? ` · next ${rule.nextOccurrenceDate}`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {/* Colour is never the only signal — the label carries it too. */}
                <Badge tone={status.tone}>{status.label}</Badge>
                <span className="hp-body font-semibold text-text">
                  {formatMoney(rule.amount)}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
