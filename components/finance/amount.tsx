import { formatMoney, negate, type Money } from '@/lib/money';
import type { AnalyticsClass } from '@/lib/finance/balance';
import { cn } from '@/lib/utils/cn';

/**
 * A money figure.
 *
 * Colour follows the semantic -text tokens, which pass AA as text — the brand
 * hexes do not. Colour is never the only signal: the sign and the surrounding
 * label always carry the meaning too.
 *
 * `showSign` renders the direction the transaction moves money, not the sign
 * of the stored number. Amounts are stored unsigned (Phase 02 §73) and the
 * direction lives in the type, so a ₱4,800 expense must read −₱4,800: taking
 * the sign from the value would print every expense as a gain.
 */
export function Amount({
  value,
  tone,
  size = 'md',
  showSign = false,
  className,
}: {
  value: Money;
  tone?: AnalyticsClass | 'neutral' | 'liability';
  size?: 'sm' | 'md' | 'lg';
  showSign?: boolean;
  className?: string;
}) {
  const tones: Record<string, string> = {
    income: 'text-success-text',
    expense: 'text-danger-text',
    refund: 'text-gold-text',
    liability: 'text-warning-text',
    neutral: 'text-text',
  };
  const sizes = { sm: 'text-sm', md: 'text-base', lg: 'hp-amount-lg' };

  // Expenses leave the account; income and refunds arrive. Anything neutral —
  // a transfer, an adjustment, a voided row — gets no sign at all, because
  // there is no single direction to claim.
  const outgoing = tone === 'expense';
  const signed = showSign && outgoing && value.minor > 0n ? negate(value) : value;
  const withSign = showSign && (tone === 'income' || tone === 'refund' || outgoing);

  return (
    <span
      className={cn('hp-amount', sizes[size], tones[tone ?? 'neutral'], className)}
      // Screen readers get the plain figure without relying on colour.
      aria-label={formatMoney(signed)}
    >
      {formatMoney(signed, { showSign: withSign })}
    </span>
  );
}
