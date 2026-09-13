import Link from 'next/link';
import { CaptureIcon, PlusIcon, TransferIcon } from '@/components/icons';

/**
 * The three circular shortcuts from the showcase's phone mock: Send/Transfer,
 * Add Transaction, Capture Receipt.
 *
 * Shown on touch widths only — on desktop the same actions are one click away
 * in the rail, and a row of large circles there is decoration, not navigation.
 */
const ACTIONS = [
  {
    label: 'Send / Transfer',
    href: '/transactions/new?type=transfer',
    Icon: TransferIcon,
  },
  { label: 'Add transaction', href: '/transactions/new', Icon: PlusIcon },
  { label: 'Capture receipt', href: '/documents', Icon: CaptureIcon },
] as const;

export function QuickActions() {
  return (
    <nav aria-label="Quick actions" className="lg:hidden">
      <ul className="grid grid-cols-3 gap-3">
        {ACTIONS.map(({ label, href, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-full flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-2 py-4 text-center"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary-fill text-on-primary">
                <Icon size={20} />
              </span>
              <span className="text-xs font-medium leading-tight text-text">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
