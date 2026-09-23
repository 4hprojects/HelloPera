import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { buttonClass } from '@/components/ui/button';
import { formatMoney } from '@/lib/money';
import { dueLabel } from '@/lib/analytics/format';
import { daysBetween } from '@/lib/finance/obligation';
import type { Confidence, ForecastEvent } from '@/types/forecast';

/**
 * The §35 timeline — every projected movement, as text.
 *
 * §53 requires this alongside the chart, not instead of it: "Must include
 * textual timeline. Do not rely only on chart." A projection a user cannot
 * read line by line is one they cannot check, and an unverifiable number is
 * exactly what §29 is trying to avoid.
 */

/** §44 — three words, no percentages. */
const CONFIDENCE: Record<
  Confidence,
  { label: string; tone: 'info' | 'gold' | 'neutral' }
> = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  expected: { label: 'Expected', tone: 'gold' },
  optional: { label: 'Less certain', tone: 'neutral' },
};

export function ForecastTimeline({
  events,
  today,
}: {
  events: ForecastEvent[];
  today: string;
}) {
  if (!events.length) {
    return (
      <EmptyState
        title="Nothing scheduled ahead"
        description="Add a recurring rule, a bill or expected income and it will appear here."
        action={
          <Link href="/recurring/new" className={buttonClass('primary', 'md')}>
            Add a recurring rule
          </Link>
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {events.map((event) => {
        const confidence = CONFIDENCE[event.confidence];
        const days = daysBetween(today, event.date);
        const incoming = event.direction === 'in';

        const row = (
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="hp-body truncate font-medium text-text">{event.label}</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {event.date}
                {days !== null ? ` · ${dueLabel(days) ?? ''}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Badge tone={confidence.tone}>{confidence.label}</Badge>
              {/*
                The sign carries the direction, and the word beside it repeats
                it — colour is never the only signal (DESIGN-SYSTEM).
              */}
              <span
                className={
                  incoming
                    ? 'hp-body font-semibold text-success-text'
                    : 'hp-body font-semibold text-text'
                }
              >
                {incoming ? '+' : '−'}
                {formatMoney(event.amount)}
              </span>
            </div>
          </div>
        );

        return (
          <li key={event.id}>
            {event.href ? (
              <Link
                href={event.href}
                className="block rounded-[var(--radius-hp)] transition-colors hover:bg-surface-raised"
              >
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
