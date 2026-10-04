import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/guards';
import { todayInTimezone, STATUS_LABELS } from '@/lib/finance/obligation';
import { toDecimalString } from '@/lib/money';
import {
  getObligation,
  listPaymentCandidates,
  type ObligationKind,
} from '@/services/obligation.service';
import { listAccounts } from '@/services/account.service';
import { cancelObligationAction } from '@/app/actions/obligations';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PaymentForm } from './payment-form';
import { Amount } from './amount';

export async function ObligationDetail({
  kind,
  id,
}: {
  kind: ObligationKind;
  id: string;
}) {
  const { profile } = await requireUser();
  const today = todayInTimezone(profile.timezone);
  const item = await getObligation(kind, id, today);
  if (!item) notFound();
  const accounts = (await listAccounts()).filter(
    (a) => a.currency_code === item.currency && (kind === 'bill' || a.nature === 'asset'),
  );
  const candidates = await listPaymentCandidates({ kind, currency: item.currency });
  const open = item.lifecycle !== 'cancelled' && item.remaining.minor > 0n;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader
        title={item.name}
        description={`${STATUS_LABELS[item.display]} · ${item.currency}`}
      />
      <Card>
        <p>
          Remaining: <Amount value={item.remaining} />
        </p>
        <p>
          Already recorded: <Amount value={item.applied} />
        </p>
        {item.date && <p>Due: {item.date}</p>}
        {item.description && <p>{item.description}</p>}
      </Card>
      {open && (
        <Card>
          <h2 className="hp-h2 mb-4">Record payment</h2>
          <PaymentForm
            kind={kind}
            id={id}
            today={today}
            amount={toDecimalString(item.remaining.minor)}
            currency={item.currency}
            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
            initialCandidates={candidates}
          />
        </Card>
      )}
      {open && (
        <Card>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-danger-text">
              Cancel this item
            </summary>
            <p className="mb-3">
              This stops tracking the remaining amount. Existing payments and transactions
              are kept.
            </p>
            <form action={cancelObligationAction}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={id} />
              <Button type="submit" variant="danger">
                Confirm cancellation
              </Button>
            </form>
          </details>
        </Card>
      )}
      <Link
        className="inline-flex min-h-11 items-center text-primary-text underline"
        href="/transactions"
      >
        View transaction history
      </Link>
    </div>
  );
}
