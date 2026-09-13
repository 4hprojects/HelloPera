'use client';

import { useActionState } from 'react';
import { expectedEventAction } from '@/app/actions/recurring';
import type { ActionState } from '@/app/actions/auth';
import { Badge } from '@/components/ui/badge';
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
export function OccurrenceList({ events }: { events: ExpectedEvent[] }) {
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

          return (
            <li key={event.id} className="flex items-center justify-between gap-3 py-3">
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
                      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
                        {event.includeInForecast ? 'Exclude' : 'Include'}
                      </Button>
                    </form>
                    <form action={action}>
                      <input type="hidden" name="id" value={event.id} />
                      <input type="hidden" name="action" value="skip" />
                      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
                        Skip
                      </Button>
                    </form>
                  </>
                ) : null}
              </div>
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
