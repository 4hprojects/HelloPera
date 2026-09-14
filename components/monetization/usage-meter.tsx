import type { UsageState } from '@/lib/monetization/limits';

const LABELS: Record<string, string> = {
  ocr_jobs: 'Document scans',
  ai_queries: 'AI questions',
  document_uploads: 'Uploads',
  exports: 'Exports',
};

/**
 * §34 — "OCR 18 / 30".
 *
 * The bar is decorative and marked `aria-hidden`; the figure beside it carries
 * the same information as text, so the meter is never the only way to read it.
 */
export function UsageMeter({ state }: { state: UsageState }) {
  const label = LABELS[state.feature] ?? state.feature;

  if (state.limit === null) {
    return (
      <div className="py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="hp-body text-text">{label}</span>
          <span className="hp-body text-text-muted">{state.used} used</span>
        </div>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((state.used / state.limit) * 100));

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="hp-body text-text">{label}</span>
        <span
          className={
            state.blocked
              ? 'hp-body font-semibold text-danger-text'
              : 'hp-body text-text-muted'
          }
        >
          {state.used} / {state.limit}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised"
      >
        <div
          className={state.blocked ? 'h-full bg-danger-text' : 'h-full bg-primary-fill'}
          style={{ width: `${pct}%` }}
        />
      </div>
      {state.blocked ? (
        <p className="hp-small mt-1 text-text-muted">
          Limit reached. You can still add records manually.
        </p>
      ) : null}
    </div>
  );
}
