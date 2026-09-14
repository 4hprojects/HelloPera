import * as React from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Text input.
 *
 * ## The three border states
 *
 * Idle → focused → **filled**. A field the user has completed takes a jade
 * border, which gives silent, continuous progress down a long form without a
 * step indicator. Borrowed from helloRun's signup, where it is the single best
 * idea on the page.
 *
 * Implemented in CSS with `:not(:placeholder-shown)` rather than helloRun's
 * JS-applied `.filled` class: no state to sync, no re-render per keystroke,
 * and it survives autofill — which a keystroke listener does not.
 *
 * **That requires a `placeholder`.** `:placeholder-shown` never matches
 * without one, so the filled state would silently never appear. `placeholder`
 * defaults to a single space: invisible to a sighted reader, ignored by
 * screen readers (the `<Label>` carries the name), and enough for the selector
 * to work.
 *
 * ## Colour is not the only signal (DESIGN-SYSTEM §4.1)
 *
 * The filled border is reinforcement, never information — nothing is conveyed
 * by it that the visible text in the field does not already say. In greyscale
 * it reads as a slightly darker edge, which is exactly as much as it should.
 *
 * Measured: `--hp-primary` #138a72 on `--hp-surface` #ffffff is 4.03:1, and on
 * dark #142235 it is 3.34:1 — both clear the 3:1 that WCAG 1.4.11 asks of a
 * non-text boundary. The idle `--hp-border-strong` remains the default.
 */
export function Input({
  className,
  placeholder = ' ',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      placeholder={placeholder}
      className={cn(
        'w-full rounded-[var(--radius-hp)] border border-border-strong bg-surface',
        'px-3 py-2.5 text-[0.9375rem] text-text placeholder:text-text-muted',
        'transition-colors',
        // The filled state. `:placeholder-shown` is true while the field is
        // empty, so the negation is "has a value".
        '[&:not(:placeholder-shown)]:border-primary',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
