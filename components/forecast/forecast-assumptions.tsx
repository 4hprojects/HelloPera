import type { ForecastAssumptions } from '@/types/forecast';

/**
 * §45 — what the projection does and does not count.
 *
 * "This improves trust." More precisely: a number without its inputs is a
 * guess the user has to take on faith, and §29 makes determinism the whole
 * point of this feature. Stating the inputs is what lets someone disagree
 * with the forecast for a good reason instead of distrusting it for a vague
 * one.
 */
export function ForecastAssumptionsPanel({
  assumptions,
}: {
  assumptions: ForecastAssumptions;
}) {
  const {
    includeReceivables,
    liquidAccounts,
    excludedAccounts,
    horizonDays,
    currency,
    multiCurrency,
  } = assumptions;

  const lines: string[] = [
    `Projects the next ${horizonDays} days from today.`,
    liquidAccounts.length
      ? `Starts from your ${currency} cash balance across ${liquidAccounts.join(', ')}.`
      : `No liquid ${currency} accounts, so the balance starts at zero.`,
    'Includes scheduled bills, expected income and recurring occurrences.',
    includeReceivables
      ? 'Receivables are included — collection is less certain than the rest.'
      : 'Receivables are excluded, because collection is less certain.',
    'Skipped, cancelled and already-recorded occurrences are left out.',
  ];

  if (excludedAccounts.length) {
    lines.push(
      `Excluded: ${excludedAccounts.map((a) => `${a.name} (${a.reason.toLowerCase()})`).join(', ')}.`,
    );
  }

  if (multiCurrency) {
    // §46 — the one assumption a user is most likely to get wrong on their own.
    lines.push(`Only ${currency} is shown. HelloPera never converts between currencies.`);
  }

  return (
    <div className="rounded-[var(--radius-hp)] bg-surface-raised p-4">
      <h3 className="hp-label mb-2 text-text-muted">What this assumes</h3>
      <ul className="space-y-1.5">
        {lines.map((line) => (
          <li key={line} className="hp-body text-sm text-text-muted">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
