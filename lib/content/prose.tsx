import type { ReactNode } from 'react';

/**
 * Article typography — PHASE-10 §67.
 *
 * Small wrappers so a guide reads as content rather than as markup, and so
 * every article shares one set of spacing decisions. Uses the design system's
 * own utilities (`docs/DESIGN-SYSTEM.md`) rather than inventing article-only
 * styles.
 */

export function P({ children }: { children: ReactNode }) {
  return <p className="hp-body mt-4 text-text">{children}</p>;
}

export function H2({ children }: { children: ReactNode }) {
  // §67 — headings descend in order. An article starting at h3, or skipping
  // from h1 to h4, is unreadable with a screen reader's heading navigation.
  return <h2 className="hp-h2 mt-8 text-text">{children}</h2>;
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="hp-h3 mt-6 text-text">{children}</h3>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mt-4 space-y-2 pl-5 [&>li]:list-disc">{children}</ul>;
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="mt-4 space-y-2 pl-5 [&>li]:list-decimal">{children}</ol>;
}

export function LI({ children }: { children: ReactNode }) {
  return <li className="hp-body text-text">{children}</li>;
}

/** A pulled-out point. Not a warning — articles here are not alarming. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-[var(--radius-hp)] bg-surface-raised p-4">
      <p className="hp-body text-text-muted">{children}</p>
    </div>
  );
}
