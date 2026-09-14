/**
 * The public route registry — PHASE-10 §11, §31, §32.
 *
 * One list, consumed by the sitemap, the navigation and the footer. They used
 * to disagree: `/pricing` shipped as a page but appeared in neither the header
 * nav nor the footer, so it existed and was unreachable. A single source is
 * what stops that recurring.
 *
 * Pure data — no `server-only` — so the sitemap route, the layout and a test
 * can all read it.
 */

export type PublicRoute = {
  path: string;
  /** Shown in navigation. Omitted routes are reachable but not listed. */
  label?: string;
  /** §31 — relative importance, 0..1. */
  priority: number;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Where the link appears. Legal pages belong in the footer, not the header. */
  placement: 'header' | 'footer' | 'both' | 'none';
};

export const PUBLIC_ROUTES: PublicRoute[] = [
  {
    path: '/',
    label: 'Home',
    priority: 1.0,
    changeFrequency: 'weekly',
    placement: 'none',
  },
  {
    path: '/features',
    label: 'Features',
    priority: 0.8,
    changeFrequency: 'monthly',
    placement: 'both',
  },
  {
    path: '/pricing',
    label: 'Pricing',
    priority: 0.8,
    changeFrequency: 'monthly',
    placement: 'both',
  },
  {
    path: '/guides',
    label: 'Guides',
    priority: 0.9,
    changeFrequency: 'weekly',
    placement: 'both',
  },
  {
    path: '/about',
    label: 'About',
    priority: 0.5,
    changeFrequency: 'yearly',
    placement: 'footer',
  },
  {
    path: '/help',
    label: 'Help',
    priority: 0.6,
    changeFrequency: 'monthly',
    placement: 'both',
  },
  {
    path: '/faq',
    label: 'FAQ',
    priority: 0.6,
    changeFrequency: 'monthly',
    placement: 'footer',
  },
  {
    path: '/contact',
    label: 'Contact',
    priority: 0.4,
    changeFrequency: 'yearly',
    placement: 'footer',
  },
  {
    path: '/privacy',
    label: 'Privacy',
    priority: 0.3,
    changeFrequency: 'yearly',
    placement: 'footer',
  },
  {
    path: '/terms',
    label: 'Terms',
    priority: 0.3,
    changeFrequency: 'yearly',
    placement: 'footer',
  },
];

/**
 * §33 — everything a crawler must never index.
 *
 * Prefixes rather than exact paths, because the whole point is to cover routes
 * that do not exist yet. `/dashboard` today, `/dashboard/anything` tomorrow.
 */
export const DISALLOWED_PREFIXES = [
  '/dashboard',
  '/accounts',
  '/transactions',
  '/bills',
  '/receivables',
  '/expected-income',
  '/documents',
  '/analytics',
  '/recurring',
  '/forecast',
  '/notifications',
  '/settings',
  '/admin',
  '/api',
  '/login',
  '/register',
  '/reset-password',
  '/forgot-password',
  '/verify-email',
  '/auth',
];

export const headerRoutes = (): PublicRoute[] =>
  PUBLIC_ROUTES.filter((r) => r.placement === 'header' || r.placement === 'both');

export const footerRoutes = (): PublicRoute[] =>
  PUBLIC_ROUTES.filter((r) => r.placement === 'footer' || r.placement === 'both');
