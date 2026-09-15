'use client';

import { useActionState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { askAssistantAction, type AssistantState } from '@/app/actions/ai';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextareaField } from '@/components/ui/field';
import { MAX_QUESTION_LENGTH } from '@/schemas/ai.schema';

/**
 * The assistant conversation — PHASE-12 §81, §82, §83, §84, §85, §86.
 *
 * One question at a time, with the answer, its breakdown and its assumptions
 * rendered as structure rather than as a wall of prose. §23 wants the figures
 * visible as figures: a person checking a number should be able to find it
 * without reading a paragraph.
 */

const STARTERS = [
  // §16 — the point of these is to teach the boundary of what can be asked
  // without writing a manual. Each one maps to a different intent.
  'How much did I spend this month?',
  'What bills are due in the next 30 days?',
  'What did I spend on food last month?',
  'How does this month compare to last month?',
];

export function AssistantChat({ conversationId }: { conversationId: string | null }) {
  const [state, formAction, pending] = useActionState<AssistantState, FormData>(
    askAssistantAction,
    {},
  );

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  // Move focus to the answer when one arrives. Without this a screen-reader
  // user has no idea anything happened — the form looks unchanged.
  useEffect(() => {
    if (state.answer || state.error || state.limitReached) {
      answerRef.current?.focus();
    }
  }, [state]);

  const ask = (question: string) => {
    if (inputRef.current) {
      inputRef.current.value = question;
      inputRef.current.form?.requestSubmit();
    }
  };

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <input
          type="hidden"
          name="conversationId"
          value={state.answer?.conversationId ?? conversationId ?? ''}
        />
        <TextareaField
          ref={inputRef}
          id="question"
          label="Ask about your money"
          rows={3}
          maxLength={MAX_QUESTION_LENGTH}
          required
          placeholder="How much did I spend on food this month?"
          showMessage={false}
        />
        <div className="flex items-center justify-between gap-3">
          {/* §79 — said once, where someone is about to ask. */}
          <p className="hp-small text-text-muted">
            HelloPera explains your own records. It does not give financial advice.
          </p>
          <Button type="submit" disabled={pending} className="shrink-0">
            {pending ? 'Thinking…' : 'Ask'}
          </Button>
        </div>
      </form>

      {/* §84 — a loading state that says what is happening, not a bare spinner. */}
      <div
        ref={answerRef}
        tabIndex={-1}
        aria-live="polite"
        aria-busy={pending}
        className="focus:outline-none"
      >
        {pending ? (
          <p className="hp-body text-text-muted">
            Working out the answer from your records…
          </p>
        ) : null}

        {state.limitReached ? <LimitReached {...state.limitReached} /> : null}

        {state.error ? (
          <Card>
            <p className="hp-body text-text">{state.error}</p>
            {/* §93 — the rest of the product is unaffected, and saying so is
                more useful than an apology. */}
            <p className="hp-small mt-2 text-text-muted">
              Your analytics, forecast and records all still work.
            </p>
          </Card>
        ) : null}

        {state.answer && !pending ? <Answer answer={state.answer} /> : null}
      </div>

      {!state.answer && !pending ? (
        <div>
          <p className="hp-label text-text-muted">Try asking</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => ask(s)}
                  className="hp-small rounded-full border border-border px-3 py-1.5 text-left text-text-muted hover:border-border-strong hover:text-text"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Answer({ answer }: { answer: NonNullable<AssistantState['answer']> }) {
  const { result } = answer;

  return (
    <Card>
      <p className="hp-body text-text">{answer.text}</p>

      {/*
        §23 — the figures, as figures. A person checking a number should find
        it without reading the sentence again.
      */}
      {result && result.figures.length > 0 ? (
        <dl className="mt-3 divide-y divide-border border-y border-border">
          {result.figures.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-3 py-2">
              {/*
                `min-w-0` so a long label wraps instead of pushing the amount
                off a 320px screen, and the amount never shrinks — a truncated
                figure is worse than a wrapped label.
              */}
              <dt className="hp-small min-w-0 text-text-muted">{f.label}</dt>
              <dd className="hp-body shrink-0 font-medium tabular-nums text-text">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {answer.lines.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {answer.lines.map((line, i) => (
            <li key={i} className="hp-small break-words text-text-muted">
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {/* §16, §35 — assumptions under the answer, never hidden. */}
      {answer.assumptions.length > 0 ? (
        <div className="mt-3 rounded-[var(--radius-hp)] bg-tint-ink p-3">
          <p className="hp-label text-text-muted">What this assumes</p>
          <ul className="mt-1 space-y-1">
            {answer.assumptions.map((a) => (
              <li key={a} className="hp-small text-text-muted">
                {a}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* §69, §70 — the drill-down, so the answer is checkable. */}
      {result?.href && result.hrefLabel ? (
        <Link href={result.href} className={buttonClass('ghost', 'sm', 'mt-3')}>
          {result.hrefLabel}
        </Link>
      ) : null}
    </Card>
  );
}

/** §42 — the copy a limit deserves: what was used, when it resets, what to do. */
function LimitReached({
  used,
  limit,
  resetsOn,
}: NonNullable<AssistantState['limitReached']>) {
  const resets = new Date(`${resetsOn}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <Card>
      <p className="hp-body text-text">
        You have used all {limit} of your assistant questions this month.
      </p>
      <p className="hp-small mt-1 text-text-muted">
        Your limit resets on {resets}. You asked {used} question{used === 1 ? '' : 's'}.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/settings/plan" className={buttonClass('primary', 'sm')}>
          View plans
        </Link>
        {/* Core analytics stay reachable — §42 is explicit about this. */}
        <Link href="/analytics" className={buttonClass('ghost', 'sm')}>
          Use manual analytics
        </Link>
      </div>
    </Card>
  );
}
