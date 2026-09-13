import Link from 'next/link';
import { Amount } from '@/components/finance/amount';
import { SectionCard } from '@/components/ui/card';
import { isZero } from '@/lib/money';
import type { CurrencySlice } from '@/types/dashboard';

/**
 * Income, gross expenses, refunds, net expenses — §11 to §15.
 *
 * §14 requires all three expense figures visible, not just the net: "a large
 * refund cannot silently hide a large purchase", and a month with a ₱20,000
 * purchase and a ₱20,000 return is not the same as a month with no activity.
 *
 * Adjustments get their own line when there are any (§15). They are neither
 * income nor expense, but they do move balances — which is the answer to "why
 * doesn't income minus expenses match what my accounts did".
 */
export function CashFlowSummary({ slice }: { slice: CurrencySlice }) {
  const { cashFlow } = slice;
  const hasAdjustments =
    !isZero(cashFlow.adjustments.increase) || !isZero(cashFlow.adjustments.decrease);

  return (
    <SectionCard
      title="This month"
      action={
        <Link href="/transactions" className="hp-small font-semibold text-primary-text">
          View all
        </Link>
      }
    >
      {cashFlow.rowCount === 0 ? (
        <p className="hp-body py-6 text-center text-text-muted">
          No transactions this month.
        </p>
      ) : (
        <dl className="divide-y divide-border">
          <Row label="Income">
            <Amount value={cashFlow.income} tone="income" />
          </Row>
          <Row label="Gross expenses">
            <Amount value={cashFlow.grossExpenses} tone="expense" />
          </Row>
          {!isZero(cashFlow.refunds) ? (
            <Row label="Refunds" hint="Returned to you, netted against expenses">
              <Amount value={cashFlow.refunds} tone="refund" />
            </Row>
          ) : null}
          <Row label="Net expenses" strong>
            <Amount value={cashFlow.netExpenses} tone="expense" />
          </Row>
          <Row label="Net cash flow" strong hint="Income less net expenses">
            <Amount
              value={cashFlow.netCashFlow}
              tone={cashFlow.netCashFlow.minor < 0n ? 'expense' : 'income'}
            />
          </Row>
          {hasAdjustments ? (
            <Row label="Balance adjustments" hint="Not counted as income or expense">
              <span className="hp-small text-text-muted">
                <Amount value={cashFlow.adjustments.increase} size="sm" /> in ·{' '}
                <Amount value={cashFlow.adjustments.decrease} size="sm" /> out
              </span>
            </Row>
          ) : null}
        </dl>
      )}
    </SectionCard>
  );
}

function Row({
  label,
  hint,
  strong,
  children,
}: {
  label: string;
  hint?: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="min-w-0">
        <span
          className={strong ? 'text-sm font-semibold text-text' : 'text-sm text-text'}
        >
          {label}
        </span>
        {hint ? <span className="hp-small block text-text-muted">{hint}</span> : null}
      </dt>
      <dd className="shrink-0 text-right">{children}</dd>
    </div>
  );
}
