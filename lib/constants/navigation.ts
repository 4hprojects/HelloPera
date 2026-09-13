import type { IconName } from '@/components/icons';

/**
 * Navigation definitions — Phase 00 §9.
 *
 * Routes marked `placeholder` have no implementation yet. Phase 01 §48 warns
 * against cluttering the shell with dead links, so the shells render only
 * what exists and keep the rest here as the roadmap.
 */

export type NavItem = {
  label: string;
  href: string;
  /** Key into components/icons ICONS. Nav data stays serialisable. */
  icon?: IconName;
  placeholder?: boolean;
  /** Phase that makes this route real. */
  phase?: string;
};

export const publicNav: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Features', href: '/features' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

export const appNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'home' },
  { label: 'Transactions', href: '/transactions', icon: 'transactions' },
  { label: 'Accounts', href: '/accounts', icon: 'accounts' },
  { label: 'Bills', href: '/bills', icon: 'bills' },
  { label: 'Receivables', href: '/receivables', icon: 'receivables' },
  { label: 'Expected income', href: '/expected-income', icon: 'calendar' },
  { label: 'Documents', href: '/documents', icon: 'documents' },
  { label: 'Recurring', href: '/recurring', icon: 'calendar' },
  { label: 'Forecast', href: '/forecast', icon: 'analytics' },
  { label: 'Analytics', href: '/analytics', icon: 'analytics' },
  { label: 'Notifications', href: '/notifications', icon: 'calendar' },
  { label: 'Settings', href: '/settings', icon: 'settings' },
];

/**
 * Mobile priority bar — master plan §51. The showcase draws five slots with
 * Capture in the middle; Phase 04 shipped upload, so it points at /documents
 * rather than sitting dead.
 */
export const mobileNav: NavItem[] = [
  { label: 'Home', href: '/dashboard', icon: 'home' },
  { label: 'Transactions', href: '/transactions', icon: 'transactions' },
  { label: 'Capture', href: '/documents', icon: 'capture' },
  { label: 'Analytics', href: '/analytics', icon: 'analytics' },
  { label: 'More', href: '/settings', icon: 'more' },
];

export const adminNav: NavItem[] = [
  { label: 'Overview', href: '/admin' },
  { label: 'Users', href: '/admin/users', placeholder: true, phase: '13' },
  {
    label: 'Subscriptions',
    href: '/admin/subscriptions',
    placeholder: true,
    phase: '13',
  },
  { label: 'OCR Jobs', href: '/admin/ocr-jobs', placeholder: true, phase: '13' },
  { label: 'System', href: '/admin/system', placeholder: true, phase: '13' },
];
