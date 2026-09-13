import Link from 'next/link';
import { Sparkline } from '@/components/charts/sparkline';
import { ExpenseIcon, type IconName, Icon, IncomeIcon } from '@/components/icons';
import { Card, IconChip, type ChipTone } from '@/components/ui/card';
import { formatMoney, type Money } from '@/lib/money';
import { cn } from '@/lib/utils/cn';

/**
 * A headline figure — the showcase's stat card: tinted icon chip, label, the
 * amount, a change line, and a trend sparkline across the bottom.
 *
 * The change line pairs an arrow glyph with the words "from last month", so
 * direction survives greyscale and a screen reader hears the full sentence
 * rather than a coloured triangle. `goodWhenUp` flips which direction is
 * green: expenses rising is not good news.
 */
export function StatCard({
  label,
  icon,
  tone = 'primary',
  value,
  change,
  goodWhenUp = true,
  note,
  trend,
  href,
}: {
  label: string;
  icon: IconName;
  tone?: ChipTone;
  value: Money;
  /** Percent change against the previous month, or null when incomparable. */
  change?: number | null;
  goodWhenUp?: boolean;
  /** Shown instead of the change line, e.g. "3 due this month". */
  note?: { text: string; tone: 'gold' | 'muted' };
  trend?: readonly number[];
  href?: string;
}) {
  const sparkColour =
    tone === 'danger'
      ? 'var(--hp-chart-2)'
      : tone === 'gold'
        ? 'var(--hp-chart-4)'
        : 'var(--hp-chart-1)';

  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <IconChip tone={tone} size={36}>
          <Icon name={icon} size={19} />
        </IconChip>
        <span className="hp-small font-medium text-text-muted">{label}</span>
      </div>

      <p className="hp-amount hp-amount-lg mt-3 text-text">{formatMoney(value)}</p>

      <div className="mt-1.5 min-h-[1.25rem]">
        {note ? (
          <p
            className={cn(
              'hp-small font-medium',
              note.tone === 'gold' ? 'text-gold-text' : 'text-text-muted',
            )}
          >
            {note.text}
          </p>
        ) : change === null || change === undefined ? (
          <p className="hp-small text-text-muted">No prior month to compare</p>
        ) : (
          <ChangeLine value={change} goodWhenUp={goodWhenUp} />
        )}
      </div>

      {trend && trend.length > 1 ? (
        <div className="-mx-1 mt-3">
          <Sparkline values={trend} stroke={sparkColour} height={36} />
        </div>
      ) : null}
    </>
  );

  return (
    <Card className="p-4">
      {href ? (
        <Link href={href} className="block rounded-xl">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

function ChangeLine({ value, goodWhenUp }: { value: number; goodWhenUp: boolean }) {
  const up = value >= 0;
  const good = up === goodWhenUp;
  const Glyph = up ? IncomeIcon : ExpenseIcon;

  return (
    <p
      className={cn(
        'hp-small inline-flex items-center gap-1 font-medium',
        good ? 'text-success-text' : 'text-danger-text',
      )}
    >
      <Glyph size={14} className="shrink-0" />
      {Math.abs(value).toFixed(1)}% from last month
    </p>
  );
}
