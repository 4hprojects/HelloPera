import * as React from 'react';

/**
 * The admin table — PHASE-13 §77, §78.
 *
 * Every admin screen is a list of operational rows, and every one of them has
 * more columns than a phone has width. Rather than each page inventing its own
 * answer, the scroll container lives here once.
 *
 * `overflow-x-auto` on the wrapper and nowhere else is deliberate: the design
 * rules allow a table to scroll sideways inside its own container, but the page
 * body must never do so. A table that widens the document is the single most
 * common way a responsive layout breaks, and it breaks silently — on a desk it
 * looks perfect.
 */
export function DataTable({
  headers,
  children,
  empty = 'Nothing to show.',
  rowCount,
}: {
  headers: readonly string[];
  children: React.ReactNode;
  empty?: string;
  rowCount: number;
}) {
  if (rowCount === 0) {
    return (
      <div className="rounded-[var(--radius-hp)] border border-dashed border-border-strong p-6 text-center">
        <p className="hp-body text-text-muted">{empty}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-hp)] border border-border">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col" className="hp-label px-3 py-2 text-text-muted">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({
  children,
  numeric = false,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <td
      className={
        numeric
          ? 'hp-small px-3 py-2 tabular-nums text-text'
          : 'hp-small px-3 py-2 text-text'
      }
    >
      {children}
    </td>
  );
}

/**
 * A status word.
 *
 * Phase 00 §7 — the word carries the meaning and the tint only reinforces it.
 * An admin reading a greyscale screenshot in a bug report needs the same
 * information as one looking at the screen.
 */
export function StatusText({ value }: { value: string }) {
  const tone =
    value === 'failed' || value === 'disabled' || value === 'unavailable'
      ? 'text-danger-text'
      : value === 'suspended' || value === 'pending' || value === 'degraded'
        ? 'text-warning-text'
        : value === 'succeeded' || value === 'active' || value === 'operational'
          ? 'text-success-text'
          : 'text-text-muted';
  return (
    <span className={`hp-small font-medium ${tone}`}>{value.replace(/_/g, ' ')}</span>
  );
}
