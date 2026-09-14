'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/app/actions/auth';

/**
 * An admin mutation form — PHASE-13 §74, §75, §54.
 *
 * Every admin mutation shares the same three requirements, so they live here
 * once rather than being re-typed per screen and drifting:
 *
 *   - a **reason**, because §54 requires one on every audited action and the
 *     server refuses without it. Asking for it in the UI is how that stops
 *     being an error message and starts being a habit;
 *   - a **typed confirmation** for anything destructive (§74). A button is one
 *     mis-click from suspending a customer;
 *   - the **result reported back**, since a mutation that appears to do nothing
 *     is a mutation someone performs twice.
 */
export function AdminForm({
  action,
  hidden,
  children,
  submitLabel,
  destructive = false,
  reasonLabel = 'Reason',
  reasonName = 'reason',
  multiline = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hidden?: Record<string, string>;
  children?: React.ReactNode;
  submitLabel: string;
  destructive?: boolean;
  reasonLabel?: string;
  /**
   * The field name the text is submitted under. A support note IS its own
   * reason, so that form submits it as `note` and the action derives the audit
   * reason from it rather than asking for the same sentence twice.
   */
  reasonName?: string;
  multiline?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {children}

      <div>
        <label htmlFor={`${reasonName}-field`} className="hp-label text-text-muted">
          {reasonLabel}
        </label>
        {multiline ? (
          <textarea
            id={`${reasonName}-field`}
            name={reasonName}
            required
            minLength={3}
            maxLength={4000}
            rows={3}
            className="mt-1 w-full rounded-[var(--radius-hp)] border border-border bg-surface px-3 py-2 text-text"
          />
        ) : (
          <input
            id={`${reasonName}-field`}
            name={reasonName}
            required
            minLength={3}
            maxLength={500}
            placeholder="Why are you doing this?"
            className="mt-1 w-full rounded-[var(--radius-hp)] border border-border bg-surface px-3 py-2 text-text"
          />
        )}
      </div>

      {destructive ? (
        <div>
          <label className="hp-label text-text-muted">Type CONFIRM to continue</label>
          <input
            name="confirmation"
            required
            autoComplete="off"
            className="mt-1 w-full rounded-[var(--radius-hp)] border border-border bg-surface px-3 py-2 text-text"
          />
        </div>
      ) : null}

      <Button
        type="submit"
        variant={destructive ? 'danger' : 'primary'}
        disabled={pending}
      >
        {pending ? 'Working…' : submitLabel}
      </Button>

      {/* aria-live so the outcome reaches a screen reader, not just the screen. */}
      <p aria-live="polite" className="hp-small">
        {state.error ? <span className="text-danger-text">{state.error}</span> : null}
        {state.success ? (
          <span className="text-success-text">{state.success}</span>
        ) : null}
      </p>
    </form>
  );
}
