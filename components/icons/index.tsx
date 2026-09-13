import * as React from 'react';

/**
 * Line icons, drawn to the showcase's rounded 1.6px stroke.
 *
 * Inline rather than an icon package: the set is small, it never ships a
 * kilobyte that is not on screen, and every glyph inherits `currentColor` so
 * the navigation rail, the tinted chips and the mobile bar all tint it from
 * their own token without a per-theme variant.
 *
 * Every icon here is decorative — the label beside it carries the meaning —
 * so they render `aria-hidden`. An icon that is ever alone needs its own
 * accessible name from the control that wraps it.
 */
export type IconProps = {
  size?: number;
  className?: string;
};

function Svg({
  size = 20,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-3.5V14h-7v6.5H5A1.5 1.5 0 0 1 3.5 19z" />
    </Svg>
  );
}

export function TransactionsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M7.5 9.5h6M7.5 13.5h9M7.5 16.5h4" />
    </Svg>
  );
}

export function CaptureIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 8.5h2.6l1.3-2h7.2l1.3 2h2.6A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-8a1.5 1.5 0 0 1 1.5-1.5z" />
      <circle cx="12" cy="14" r="3.2" />
    </Svg>
  );
}

export function AccountsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="12.5" rx="2.5" />
      <path d="M3 10.5h18M16.5 15h2" />
    </Svg>
  );
}

export function BillsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 3.5h12a1 1 0 0 1 1 1v16l-2.5-1.6-2.5 1.6-2.5-1.6-2.5 1.6L6 20.5v-16a1 1 0 0 1 1-1z" />
      <path d="M9.5 8.5h5M9.5 12.5h5" />
    </Svg>
  );
}

export function ReceivablesIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21s-7.5-4.4-7.5-9.4A4.1 4.1 0 0 1 12 8.8a4.1 4.1 0 0 1 7.5 2.8C19.5 16.6 12 21 12 21z" />
      <path d="M12 12.5v3M10.5 14h3" />
    </Svg>
  );
}

export function AnalyticsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16.5v-4M12 16.5v-8M16 16.5v-6" />
    </Svg>
  );
}

export function DocumentsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.5 3.5h7L19 9v11.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
      <path d="M13.5 3.5V9H19" />
    </Svg>
  );
}

export function SettingsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3.2v2M12 19v2M19.4 7.8l-1.7 1M6.3 15.2l-1.7 1M4.6 7.8l1.7 1M17.7 15.2l1.7 1" />
    </Svg>
  );
}

export function IncomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 19V5" />
      <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
    </Svg>
  );
}

export function ExpenseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14" />
      <path d="m17.5 13.5-5.5 5.5-5.5-5.5" />
    </Svg>
  );
}

export function WalletIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 8.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1" />
      <rect x="3.5" y="8.5" width="17" height="11" rx="2" />
      <circle cx="16" cy="14" r="1.2" />
    </Svg>
  );
}

export function CalendarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3.5V6M16 3.5V6" />
    </Svg>
  );
}

export function TransferIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 9h13l-3-3M19.5 15h-13l3 3" />
    </Svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </Svg>
  );
}

export function BellIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5z" />
      <path d="M10.2 18.5a2 2 0 0 0 3.6 0" />
    </Svg>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Svg>
  );
}

export function ArrowRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" />
    </Svg>
  );
}

export function MoreIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Name → component, so navigation data can stay plain serialisable objects. */
export const ICONS = {
  home: HomeIcon,
  transactions: TransactionsIcon,
  capture: CaptureIcon,
  accounts: AccountsIcon,
  bills: BillsIcon,
  receivables: ReceivablesIcon,
  analytics: AnalyticsIcon,
  documents: DocumentsIcon,
  settings: SettingsIcon,
  income: IncomeIcon,
  expense: ExpenseIcon,
  wallet: WalletIcon,
  calendar: CalendarIcon,
  transfer: TransferIcon,
  plus: PlusIcon,
  more: MoreIcon,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, ...rest }: IconProps & { name: IconName }) {
  const Component = ICONS[name];
  return <Component {...rest} />;
}
