import * as React from 'react';
import { cn } from '@/lib/utils/cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold';

/**
 * Status pill — the Income / Expense / Due Soon / Overdue / Paid / Upcoming
 * set from the showcase: a tinted ground with the matching -text colour on
 * it, no border.
 *
 * Colour is never the only signal — the label text always carries the meaning
 * too (Phase 00 §7). A colour-blind user and a greyscale screenshot both need
 * to read the same thing.
 *
 * Each pairing is measured on its own tint, not on the page background:
 * primary 4.58, success 4.68, warning 4.62, danger 4.63, gold 4.70, neutral
 * 7.74 — all clear AA for the small text a pill contains.
 */
const tones: Record<Tone, string> = {
  neutral: 'bg-tint-ink text-ink-text',
  success: 'bg-tint-success text-success-text',
  warning: 'bg-tint-warning text-warning-text',
  danger: 'bg-tint-danger text-danger-text',
  info: 'bg-tint-primary text-primary-text',
  gold: 'bg-tint-gold text-gold-text',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1',
        'text-xs font-semibold whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
