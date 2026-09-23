import Link from 'next/link';
import { BillsIcon, CaptureIcon, ExpenseIcon, IncomeIcon } from '@/components/icons';
import { cn } from '@/lib/utils/cn';

/**
 * The four records people most often need to capture quickly. Expense leads
 * because it is the daily path; the other actions stay visually quieter.
 */
const ACTIONS = [
  {
    label: 'Add expense',
    href: '/transactions/new?type=expense',
    Icon: ExpenseIcon,
    primary: true,
  },
  {
    label: 'Add income',
    href: '/transactions/new?type=income',
    Icon: IncomeIcon,
    primary: false,
  },
  { label: 'Upload receipt', href: '/documents', Icon: CaptureIcon, primary: false },
  { label: 'Add bill', href: '/bills/new', Icon: BillsIcon, primary: false },
] as const;

export function QuickActions() {
  return (
    <nav
      aria-label="Quick actions"
      className="rounded-[var(--radius-hp)] bg-surface p-2 shadow-sm"
    >
      <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {ACTIONS.map(({ label, href, Icon, primary }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                'flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-hp)] px-3 py-2 text-sm font-semibold transition-colors',
                primary
                  ? 'bg-primary-fill text-on-primary hover:opacity-90'
                  : 'text-text hover:bg-surface-muted',
              )}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
