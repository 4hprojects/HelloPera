/**
 * Transaction currency comes from the accounts a transaction touches, never
 * from the profile default. A PHP-profile user recording an expense on a USD
 * account is recording USD.
 */

export type CurrencyAccount = { id: string; currency: string };

export type DerivedCurrency =
  { ok: true; currency: string } | { ok: false; message: string };

export function deriveTransactionCurrency(
  source: CurrencyAccount | null | undefined,
  destination: CurrencyAccount | null | undefined,
): DerivedCurrency {
  if (source && destination) {
    if (source.id === destination.id) {
      return { ok: false, message: 'Choose two different accounts for a transfer.' };
    }
    if (source.currency !== destination.currency) {
      return {
        ok: false,
        message: `Transfers must stay in one currency. ${source.currency} cannot move to a ${destination.currency} account.`,
      };
    }
  }
  const account = source ?? destination;
  if (!account) return { ok: false, message: 'Choose an account.' };
  return { ok: true, currency: account.currency };
}

/** Today's calendar date (YYYY-MM-DD) in the user's timezone, not UTC. */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts;
  } catch {
    // Unknown timezone: fall through to UTC rather than failing the form.
  }
  return now.toISOString().slice(0, 10);
}
