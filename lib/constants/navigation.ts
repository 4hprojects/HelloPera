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
  /**
   * PHASE-12 §92 — the route exists, but the page 404s while `ai_enabled` is
   * off. Left unmarked rather than `placeholder: true`, because the code is
   * real: what gates it is a flag and an API key, not an unwritten page.
   */
  { label: 'Assistant', href: '/assistant', icon: 'analytics' },
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
  /**
   * PHASE-12 §92 — the route exists, but the page 404s while `ai_enabled` is
   * off. Left unmarked rather than `placeholder: true`, because the code is
   * real: what gates it is a flag and an API key, not an unwritten page.
   */
  { label: 'Assistant', href: '/assistant', icon: 'analytics' },
  { label: 'More', href: '/settings', icon: 'more' },
];

export const adminNav: NavItem[] = [
  { label: 'Overview', href: '/admin' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Subscriptions', href: '/admin/subscriptions' },
  { label: 'Usage', href: '/admin/usage' },
  { label: 'Feature flags', href: '/admin/feature-flags' },
  { label: 'OCR Jobs', href: '/admin/ocr-jobs' },
  { label: 'AI', href: '/admin/ai' },
  { label: 'Notifications', href: '/admin/notifications' },
  { label: 'Content', href: '/admin/content' },
  { label: 'Integrity', href: '/admin/integrity' },
  { label: 'System', href: '/admin/system' },
  { label: 'Audit', href: '/admin/audit' },
];
