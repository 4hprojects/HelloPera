import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Card, SectionCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { requireUser } from '@/lib/auth/guards';
import { getEffectivePlan } from '@/services/plan.service';
import { listBillingHistory } from '@/services/billing.service';
import { entitlesPremium } from '@/lib/billing/lifecycle';
import type { BillingHistoryEntry, Subscription } from '@/types/monetization';

export const metadata: Metadata = { title: 'Billing' };

/**
 * /settings/billing — PHASE-11 §34, §35, §26.
 *
 * Distinct from /settings/plan, which answers "what can I do and how much have
 * I used?". This answers "what am I paying, when does it renew, and what have
 * I been charged?" — the questions someone asks when they are deciding whether
 * to keep paying, and the ones a billing page is judged on.
 *
 * §52 — the whole page 404s while `billing_enabled` is off. Not an empty state:
 * a billing page for a product that cannot charge anyone invites support
 * questions that have no answer yet.
 */
export default async function BillingPage() {
  const { user } = await requireUser();
  const { plan, subscription, billingEnabled } = await getEffectivePlan(user.id);

  if (!billingEnabled) notFound();

  const history = await listBillingHistory();

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Billing"
        description="Your subscription and payment history."
        actions={
          <Link href="/settings/plan" className={buttonClass('ghost', 'sm')}>
            Plan and usage
          </Link>
        }
      />

      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="hp-label text-text-muted">Subscription</p>
            <p className="hp-h2 mt-1 text-text">{plan.name}</p>
          </div>
          <StatusBadge subscription={subscription} />
        </div>

        {subscription ? (
          <SubscriptionDetail subscription={subscription} />
        ) : (
          <p className="hp-body mt-3 text-text-muted">
            You are on the free plan. There is nothing to pay and no card on file.
          </p>
        )}
      </Card>

      <SectionCard title="Payment history" className="mb-4">
        {history.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Charges and refunds will appear here as they happen."
          />
        ) : (
          <ul className="divide-y divide-border">
            {history.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </SectionCard>

      {/*
        §37, §38, criterion 24 — worth saying out loud on the page where
        someone is looking for their card details and not finding them.
      */}
      <p className="hp-small text-text-muted">
        HelloPera never stores your card number or bank details. Payments are handled
        entirely by our payment provider.
      </p>
    </div>
  );
}

function StatusBadge({ subscription }: { subscription: Subscription | null }) {
  if (!subscription) return <Badge tone="neutral">Free</Badge>;

  const active = entitlesPremium({
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd)
      : null,
    gracePeriodEnd: subscription.gracePeriodEnd
      ? new Date(subscription.gracePeriodEnd)
      : null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  });

  // Phase 00 §7 — the word carries the meaning; the tone only reinforces it.
  // "Payment failed" reads the same in greyscale as it does in amber.
  const label: Record<string, string> = {
    active: 'Active',
    trialing: 'Trial',
    past_due: 'Payment failed',
    grace: 'Payment failed',
    cancelled: 'Ending',
    expired: 'Expired',
    inactive: 'Inactive',
  };

  const needsAction =
    subscription.status === 'grace' || subscription.status === 'past_due';

  return (
    <Badge tone={needsAction ? 'warning' : active ? 'gold' : 'neutral'}>
      {label[subscription.status] ?? subscription.status}
    </Badge>
  );
}

function SubscriptionDetail({ subscription }: { subscription: Subscription }) {
  const renews = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : null;

  return (
    <div className="mt-3 space-y-2">
      {/*
        §24 — a failed payment is the one thing on this page someone must act
        on, so it is stated first, with the deadline and what happens after it.
      */}
      {subscription.gracePeriodEnd && subscription.status === 'grace' ? (
        <p className="hp-body text-text">
          We could not take your last payment. Premium stays on until{' '}
          {new Date(subscription.gracePeriodEnd).toLocaleDateString()} — update your
          payment method before then to keep it.
        </p>
      ) : null}

      {subscription.cancelAtPeriodEnd && renews ? (
        <p className="hp-body text-text-muted">
          Your subscription ends on {renews}. Until then nothing changes, and nothing you
          have recorded is removed.
        </p>
      ) : renews ? (
        <p className="hp-body text-text-muted">Renews on {renews}.</p>
      ) : null}

      {subscription.trialEnd ? (
        <p className="hp-small text-text-muted">
          Trial ends {new Date(subscription.trialEnd).toLocaleDateString()}.
        </p>
      ) : null}
    </div>
  );
}

function HistoryRow({ entry }: { entry: BillingHistoryEntry }) {
  const when = new Date(entry.createdAt).toLocaleDateString();
  const amount = `${entry.currencyCode === 'PHP' ? '₱' : ''}${entry.amount}`;

  const status: Record<string, string> = {
    paid: 'Paid',
    failed: 'Failed',
    refunded: 'Refunded',
    pending: 'Pending',
  };

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="hp-body text-text">{when}</p>
        <p className="hp-small text-text-muted">{status[entry.status] ?? entry.status}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="hp-body font-medium text-text">{amount}</span>
        {entry.receiptUrl ? (
          <a
            href={entry.receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hp-small text-primary underline"
          >
            Receipt
          </a>
        ) : null}
      </div>
    </li>
  );
}
