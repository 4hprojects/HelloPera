import * as React from 'react';

/** Phase 00 §24 — shared empty / loading / error presentation. */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-hp)] border border-dashed border-border-strong p-8 text-center">
      <p className="hp-h3 text-text">{title}</p>
      {description ? (
        <p className="hp-body mx-auto mt-1 max-w-sm text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Loading placeholder.
 *
 * Deliberately never renders a zero amount. Phase 06 §41: a "₱0" shown while
 * data loads is indistinguishable from a real balance of zero, and that is a
 * uniquely bad thing to be wrong about in a finance app.
 */
export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-text-muted"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-pulse rounded-full bg-border-strong"
      />
      <span className="hp-small">{label}…</span>
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-[var(--radius-hp)] border border-danger p-6 text-center"
    >
      <p className="hp-h3 text-danger-text">{title}</p>
      {description ? (
        <p className="hp-body mx-auto mt-1 max-w-sm text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Skeleton block for cards that will hold figures. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-surface-muted ${className}`}
    />
  );
}
