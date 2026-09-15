'use client';

import { useActionState } from 'react';
import { expectedEventAction } from '@/app/actions/recurring';
import type { ActionState } from '@/app/actions/auth';
import { Badge } from '@/components/ui/badge';
import { SelectField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';
import type { ExpectedEvent, ExpectedEventStatus } from '@/types/recurring';

const initial: ActionState = {};

const STATUS: Record<
  ExpectedEventStatus,
  { label: string; tone: 'info' | 'success' | 'neutral' | 'warning' }
> = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  fulfilled: { label: 'Recorded', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/**
 * §50's generated occurrences, with §41/§42/§43 actions on each.
 *
 * Skip and cancel act on ONE occurrence and leave the rule running — the
 * distinction §42 insists on keeping: skip one, pause the rule, end the rule
 * are three different intentions.
 */
export type Candidate = { id: string; date: string; label: string; amount: string };

export function OccurrenceList({
  events,
  candidates = {},
}: {
  events: ExpectedEvent[];
  /** §40 — shortlisted transactions per event id, for manual linking. */
  candidates?: Record<string, Candidate[]>;
}) {
  const [state, action, pending] = useActionState(expectedEventAction, initial);

  if (!events.length) {
    return (
      <p className="hp-body text-text-muted">
        No occurrences yet. They appear here once generated.
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-border">
        {events.map((event) => {
          const status = STATUS[event.status];
          const canAct = event.status === 'scheduled';

          const matches = candidates[event.id] ?? [];

          return (
            <li key={event.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="hp-body font-medium text-text">{event.scheduledDate}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {formatMoney(event.amount)}
                    {!event.includeInForecast && canAct ? ' · not in forecast' : ''}
                    {event.detachedFromRule ? ' · edited' : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={status.tone}>{status.label}</Badge>

                  {canAct ? (
                    <>
                      <form action={action}>
                        <input type="hidden" name="id" value={event.id} />
                        <input
                          type="hidden"
                          name="action"
                          value={event.includeInForecast ? 'exclude' : 'include'}
                        />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                        >
                          {event.includeInForecast ? 'Exclude' : 'Include'}
                        </Button>
                      </form>
                      <form action={action}>
                        <input type="hidden" name="id" value={event.id} />
                        <input type="hidden" name="action" value="skip" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                        >
                          Skip
                        </Button>
                      </form>
                      <form action={action}>
                        <input type="hidden" name="id" value={event.id} />
                        <input type="hidden" name="action" value="cancel" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                        >
                          Cancel
                        </Button>
                      </form>
                    </>
                  ) : null}
                </div>
              </div>

              {/*
                §39, §40 — manual linking only. The shortlist is ordered by
                closest amount then nearest date, but nothing is applied until
                the user picks: a wrong link silently removes a real obligation
                from the forecast.
              */}
              {canAct && matches.length ? (
                <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={event.id} />
                  <input type="hidden" name="action" value="fulfill" />
                  <SelectField
                    id={`tx-${event.id}`}
                    name="transactionId"
                    label="Already recorded?"
                    defaultValue=""
                    size="sm"
                    showMessage={false}
                    wrapClassName="min-w-0 flex-1"
                  >
                    <option value="">Choose the transaction…</option>
                    {matches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.date} · {c.label} · {c.amount}
                      </option>
                    ))}
                  </SelectField>
                  <Button type="submit" variant="ghost" size="sm" disabled={pending}>
                    Link
                  </Button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>

      {state.error ? (
        <p role="alert" className="hp-small mt-2 text-danger-text">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
