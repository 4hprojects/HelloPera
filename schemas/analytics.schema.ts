import { z } from 'zod';
import { RANGE_PRESETS } from '@/lib/analytics/range';
import { TRANSACTION_TYPES } from '@/lib/finance/types';

/**
 * Analytics inputs — PHASE-06 §65.
 *
 * Every filter **falls back** rather than throwing. §65 says to reject an
 * invalid range, category, account or currency, and these do — the bad value
 * never reaches a query — but a URL is not a form: someone following a stale
 * link, or editing a query string by hand, should land on a working page with
 * a note, not a stack trace. The forms in `schemas/finance.schema.ts` use
 * `.addIssue` because there a human is mid-task and needs to be told; here the
 * input is a navigation, and the honest response is to show something valid.
 *
 * Two things Zod cannot check and the page must (see `services/analytics.service.ts`):
 *   - **account ownership** — a UUID is well-formed whether or not it is yours.
 *     RLS makes a foreign id return nothing, which would silently read as "no
 *     activity"; the page resolves ids against the user's own accounts and
 *     drops anything unrecognised.
 *   - **currency** — must be one the user actually holds, or every total is
 *     an empty set dressed as a real zero.
 */

/**
 * A real calendar date, not merely a well-shaped string.
 *
 * `Date.parse('2026-02-31')` succeeds — JavaScript rolls it forward to March
 * 3rd — so the round-trip is what actually rejects a day that does not exist.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Use a valid date');

export const dashboardParamsSchema = z.object({
  /** §24 — 3, 6 or 12 months of trend. */
  trend: z.coerce
    .number()
    .int()
    .catch(6)
    .pipe(z.union([z.literal(3), z.literal(6), z.literal(12)]).catch(6)),
});

export type DashboardParamsInput = z.infer<typeof dashboardParamsSchema>;

export function parseDashboardParams(
  raw: Record<string, string | undefined>,
): DashboardParamsInput {
  const parsed = dashboardParamsSchema.safeParse(raw);
  return parsed.success ? parsed.data : { trend: 6 };
}

/**
 * The /analytics query string — §25 through §29, §58.
 *
 * Ordering of a custom range is not checked here: `rangeFor` swaps a reversed
 * pair and reports that it did, which lets the page say so. A schema can only
 * accept or refuse, and refusing outright would lose the user's other filters
 * along with the mistake.
 */
export const analyticsParamsSchema = z.object({
  range: z.enum(RANGE_PRESETS).catch('this-month'),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((v) => v.toUpperCase())
    .optional()
    .catch(undefined),
  accountId: z.string().uuid().optional().catch(undefined),
  categoryId: z.string().uuid().optional().catch(undefined),
  type: z.enum(TRANSACTION_TYPES).optional().catch(undefined),
});

export type AnalyticsParams = z.infer<typeof analyticsParamsSchema>;

const DEFAULTS: AnalyticsParams = { range: 'this-month' };

/**
 * Parse search params, falling back to a working view on anything unusable.
 *
 * `dropped` names the parameters that were present but unusable. Without it a
 * malformed filter is indistinguishable from no filter at all: the page
 * renders perfectly, ignores what was asked for, and says nothing — which
 * reads as "the filter is broken". Reporting it costs one comparison.
 */
export function parseAnalyticsParams(
  raw: Record<string, string | undefined>,
): AnalyticsParams & { dropped: string[] } {
  const parsed = analyticsParamsSchema.safeParse(raw);
  const data = parsed.success ? parsed.data : DEFAULTS;

  const dropped = (['from', 'to', 'currency', 'accountId', 'categoryId', 'type'] as const)
    .filter((key) => {
      const supplied = raw[key];
      return Boolean(supplied) && data[key] === undefined;
    })
    .map(String);

  return { ...data, dropped };
}

/**
 * Rebuild the query string with one value changed — for the filter chips and
 * the drill-down links, so a control never silently discards the other
 * filters the way the transactions list's pagination does.
 */
export function analyticsHref(
  current: AnalyticsParams,
  patch: Partial<AnalyticsParams>,
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();

  if (next.range !== 'this-month') params.set('range', next.range);
  if (next.range === 'custom') {
    if (next.from) params.set('from', next.from);
    if (next.to) params.set('to', next.to);
  }
  if (next.currency) params.set('currency', next.currency);
  if (next.accountId) params.set('accountId', next.accountId);
  if (next.categoryId) params.set('categoryId', next.categoryId);
  if (next.type) params.set('type', next.type);

  const query = params.toString();
  return query ? `/analytics?${query}` : '/analytics';
}
