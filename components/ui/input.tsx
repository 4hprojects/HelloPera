import * as React from 'react';

/**
 * Bare text input, styled as a field control.
 *
 * Prefer `TextField` from `@/components/ui/field` — it brings the floating
 * label, the message slot and the aria wiring. This exists for the handful of
 * places that compose their own chrome around a control, and it must be
 * rendered inside an `.hp-field` wrapper (or a `FieldShell`) for the label to
 * have anything to float against.
 *
 * ## `placeholder` defaults to a space, and that is load-bearing
 *
 * Two things hang off `:placeholder-shown`: the floating label, and the filled
 * border — a completed field takes a jade border, which gives silent,
 * continuous progress down a long form without a step indicator. Borrowed
 * from helloRun's signup, where it is the single best idea on the page.
 *
 * Both are implemented in CSS rather than helloRun's JS-applied `.filled`
 * class: no state to sync, no re-render per keystroke, and it survives
 * autofill — which a keystroke listener does not. But `:placeholder-shown`
 * never matches without a placeholder, so without this default the field
 * would look permanently filled and its label would never come to rest. A
 * single space is invisible to a sighted reader and ignored by screen readers
 * (the label carries the name).
 *
 * A real placeholder is fine, and better than it used to be: `globals.css`
 * hides it at rest and reveals it on focus, so it reads as a format example
 * under the floated label instead of competing with it.
 *
 * ## There is no `className` here on purpose
 *
 * `app/globals.css` is unlayered and loads after `@import 'tailwindcss'`, so
 * `.hp-control` beats every utility class regardless of specificity — a
 * `className="border-danger"` would silently do nothing. State belongs on the
 * `.hp-field` wrapper as a `data-*` attribute; see `field.tsx`.
 */
export function Input({
  placeholder = ' ',
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'>) {
  return <input placeholder={placeholder} className="hp-control" {...props} />;
}
