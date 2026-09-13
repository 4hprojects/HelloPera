import { Amount } from '@/components/finance/amount';
import { Badge } from '@/components/ui/badge';
import { Icon, type IconName } from '@/components/icons';
import { IconChip, type ChipTone } from '@/components/ui/card';
import { dueLabel } from '@/lib/analytics/format';
import { STATUS_LABELS, statusTone } from '@/lib/finance/obligation';
import type { ObligationView } from '@/types/dashboard';

/**
 * One bill, receivable or expected-income row.
 *
 * Shared by all four obligation sections so that "overdue" looks identical
 * everywhere — which is the whole point of a status vocabulary. The amount is
 * always what remains (§49, §50), never the original total.
 */
export function ObligationRow({
  item,
  icon,
  tone,
  timing = 'obligation',
}: {
  item: ObligationView;
  icon: IconName;
  tone: ChipTone;
  /** 'expected' softens the wording: nothing is late when nobody owes it. */
  timing?: 'obligation' | 'expected';
}) {
  const due = dueLabel(item.daysRemaining, timing);

  return (
    <li className="flex items-center gap-3 py-3">
      <IconChip tone={tone} size={38}>
        <Icon name={icon} size={18} />
      </IconChip>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{item.name}</p>
        <p className="hp-small truncate text-text-muted">
          {item.date ? item.date : 'No date'}
          {due ? ` · ${due}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <Amount value={item.amount} className="block" />
        <Badge tone={statusTone(item.status)} className="mt-1">
          {STATUS_LABELS[item.status]}
        </Badge>
      </div>
    </li>
  );
}
