'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { passwordStrength } from '@/lib/auth/password-strength';
import { cn } from '@/lib/utils/cn';

/**
 * Password input with a visibility toggle (§13), an optional length meter, and
 * optional live confirmation matching.
 *
 * The meter and the match check are opt-in rather than always on: `/login` and
 * `/reset-password` use the same component, and a strength meter beside a
 * password you are merely *recalling* is noise.
 */
export function PasswordField({
  id,
  label,
  error,
  autoComplete,
  required,
  /** Show the length meter. Registration and password reset only. */
  showStrength = false,
  /**
   * Live-compare against this value and warn when they differ.
   *
   * Deliberately checked on the CONFIRM field only. Validating while the first
   * password is still being typed means telling someone they are wrong on
   * every keystroke of something they have not finished writing.
   */
  matchAgainst,
  onChange,
}: {
  id: string;
  label: string;
  error?: string;
  autoComplete?: string;
  required?: boolean;
  showStrength?: boolean;
  matchAgainst?: string;
  onChange?: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState('');
  const errorId = useId();
  const meterId = useId();

  const strength = showStrength ? passwordStrength(value) : null;

  // Only once there is something to compare, and only when it differs.
  const mismatch =
    matchAgainst !== undefined && value.length > 0 && value !== matchAgainst;

  // A server error outranks the live hint: it is the authoritative answer.
  const message = error ?? (mismatch ? 'Passwords do not match' : null);

  return (
    <div className="mb-4">
      <Label htmlFor={id}>{label}</Label>

      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onChange?.(e.target.value);
          }}
          aria-invalid={message ? true : undefined}
          aria-describedby={
            cn(message ? errorId : '', strength?.label ? meterId : '') || undefined
          }
          className={cn('pr-16', message && 'border-danger')}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // The toggle reveals the value the user typed; it is not a security
          // control, so it needs no confirmation — but it must announce state.
          aria-pressed={visible}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-primary-text"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>

      {/*
        The meter. §4.1 — the WORD is the information; the bar repeats it, so
        this still reads in greyscale. `aria-live="polite"` announces the
        change without interrupting typing.

        Measured: the fills use `--hp-danger` #c94f5c (3.02:1 on white),
        `--hp-warning` #d58a34 (2.36:1) and `--hp-primary` #138a72 (4.03:1).
        Two fall under 3:1, which is why none of them is load-bearing — the
        label carries the meaning and is drawn in `--hp-text-muted` at 4.70:1.
      */}
      {strength && strength.label ? (
        <div className="mt-2 flex items-center gap-2">
          <div
            aria-hidden="true"
            className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className={cn(
                'h-full rounded-full transition-all duration-200',
                strength.score === 0 && 'bg-danger',
                strength.score === 1 && 'bg-warning',
                strength.score >= 2 && 'bg-primary',
              )}
              style={{ width: `${strength.percent}%` }}
            />
          </div>
          <span id={meterId} aria-live="polite" className="hp-small text-text-muted">
            {strength.label}
          </span>
        </div>
      ) : null}

      {/*
        Reserved space. The slot exists whether or not there is a message, so
        an error appearing never pushes the submit button out from under a
        thumb that is already moving toward it.
      */}
      <p
        id={errorId}
        role={message ? 'alert' : undefined}
        className={cn(
          'hp-small mt-1 min-h-[1.125rem] text-danger-text',
          !message && 'invisible',
        )}
      >
        {message ?? ' '}
      </p>
    </div>
  );
}
