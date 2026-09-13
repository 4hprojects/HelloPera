'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Labelled input with accessible error wiring.
 *
 * aria-describedby + role="alert" so a screen reader announces the error
 * rather than leaving it as red text only (§46).
 */
export function FormField({
  id,
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="mb-4">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={error ? 'border-danger' : undefined}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="hp-small mt-1 text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
