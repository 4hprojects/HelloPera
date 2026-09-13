'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Password input with a visibility toggle (§13). */
export function PasswordField({
  id,
  label,
  error,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  error?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = useId();

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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={error ? 'border-danger pr-16' : 'pr-16'}
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
      {error ? (
        <p id={errorId} role="alert" className="hp-small mt-1 text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
