import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-[var(--radius-hp)] border border-border-strong bg-surface',
        'px-3 py-2.5 text-[0.9375rem] text-text placeholder:text-text-muted',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
