'use client';

import { useActionState, useState } from 'react';
import {
  confirmDraftsAction,
  discardExtractionAction,
  type DraftsState,
} from '@/app/actions/extraction';
import { FormAlert } from '@/components/auth/form-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectField, TextField } from '@/components/ui/field';
import { cn } from '@/lib/utils/cn';
import { LOW_CONFIDENCE_THRESHOLD, type Draft } from '@/lib/ocr/schema';

const initial: DraftsState = {};

type Kind = 'expense' | 'income' | 'bill' | 'receivable' | 'expected_income';

const KINDS: Array<{ value: Kind; label: string }> = [
  { value: 'expense', label: 'Expense I paid' },
  { value: 'income', label: 'Income I received' },
  { value: 'bill', label: 'Bill I owe' },
  { value: 'receivable', label: 'Money owed to me' },
  { value: 'expected_income', label: 'Income I expect' },
];

const NAME_LABEL: Record<Kind, string> = {
  expense: 'Merchant',
  income: 'Source',
  bill: 'Provider',
  receivable: 'Who owes you',
  expected_income: 'Source',
};

const DATE_LABEL: Record<Kind, string> = {
  expense: 'Date',
  income: 'Date',
  bill: 'Due date',
  receivable: 'Expected by (optional)',
  expected_income: 'Expected on',
};

function kindOf(d: Draft): Kind {
  if (d.target === 'transaction') return d.direction === 'income' ? 'income' : 'expense';
  return d.target;
}

type AccountOption = { id: string; name: string };
type CategoryOption = { id: string; name: string; type: 'income' | 'expense' | 'both' };

export type DraftCardData = {
  draft: Draft;
  /** Index in the stored list. Saved records keep their number. */
  index: number;
  saved: boolean;
  /** Why this might already be recorded; empty when nothing matched. */
  duplicates: string[];
};

/**
 * Every record the document could become, as cards you tick and edit.
 *
 * Nothing is saved until you press the button, and what is saved is what is in
 * the boxes, not what was read. Possible duplicates start unticked.
 */
export function DraftList({
  extractionId,
  documentId,
  cards,
  currency,
  accounts,
  categories,
}: {
  extractionId: string;
  documentId: string;
  cards: DraftCardData[];
  currency: string;
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [state, action, pending] = useActionState(confirmDraftsAction, initial);
  const open = cards.filter((c) => !c.saved);

  const [kinds, setKinds] = useState<Record<number, Kind>>(() =>
    Object.fromEntries(cards.map((c) => [c.index, kindOf(c.draft)])),
  );
  const [ticked, setTicked] = useState<Set<number>>(
    () => new Set(open.filter((c) => c.duplicates.length === 0).map((c) => c.index)),
  );

  const toggle = (i: number) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Cards saved by an earlier press stay in `ticked`; only open ones count.
  const live = new Set(open.map((c) => c.index));
  const tickedLive = [...ticked].filter((i) => live.has(i));

  const needsAccount = tickedLive.some(
    (i) => kinds[i] === 'expense' || kinds[i] === 'income',
  );
  const resultFor = new Map((state.results ?? []).map((r) => [r.index, r]));
  const savedCount = cards.length - open.length;

  return (
    <>
      <form action={action}>
        <input type="hidden" name="extractionId" value={extractionId} />
        <input type="hidden" name="documentId" value={documentId} />
        <input type="hidden" name="currency" value={currency} />
        <input
          type="hidden"
          name="count"
          value={Math.max(...cards.map((c) => c.index), -1) + 1}
        />

        <p className="hp-body mb-1 text-text">
          <strong>
            {cards.length} possible record{cards.length === 1 ? '' : 's'}
          </strong>{' '}
          found{savedCount > 0 ? ` · ${savedCount} saved` : ''}.
        </p>
        <p className="hp-small mb-3 text-text-muted">
          Tick the ones to keep and fix anything that looks wrong. Nothing is saved until
          you press Save.
        </p>

        {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
        {state.success ? <FormAlert tone="success">{state.success}</FormAlert> : null}

        {open.length > 1 ? (
          <div className="mb-3 flex gap-3">
            <button
              type="button"
              className="min-h-11 hp-small font-medium text-primary-text"
              onClick={() => setTicked(new Set(open.map((c) => c.index)))}
            >
              Select all
            </button>
            <button
              type="button"
              className="min-h-11 hp-small font-medium text-primary-text"
              onClick={() => setTicked(new Set())}
            >
              Select none
            </button>
          </div>
        ) : null}

        {needsAccount ? (
          <SelectField
            id="accountId"
            label="Account for expenses and income"
            required
            wrapClassName="mb-4"
            hint="Expenses come out of it and income goes into it."
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        ) : null}

        <ul className="space-y-3">
          {cards.map(({ draft, index, saved, duplicates }) => {
            const kind = kinds[index] ?? kindOf(draft);
            const on = ticked.has(index);
            const result = resultFor.get(index);
            const uncertain =
              draft.confidence != null && draft.confidence < LOW_CONFIDENCE_THRESHOLD;
            const options = categories.filter((c) =>
              kind === 'income' || kind === 'expected_income'
                ? c.type !== 'expense'
                : c.type !== 'income',
            );

            return (
              <li key={index}>
                <Card
                  className={cn(saved && 'opacity-60', on && !saved && 'border-primary')}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className="flex min-h-11 items-center gap-3 text-text">
                      {saved ? null : (
                        <input
                          type="checkbox"
                          name={`d${index}.selected`}
                          checked={on}
                          onChange={() => toggle(index)}
                          className="size-5"
                        />
                      )}
                      <span className="font-medium">
                        {draft.name || `Record ${index + 1}`}
                      </span>
                    </label>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {saved ? <Badge tone="success">Saved</Badge> : null}
                      {uncertain ? <Badge tone="warning">Check this</Badge> : null}
                      {duplicates.length > 0 && !saved ? (
                        <Badge tone="warning">Maybe a duplicate</Badge>
                      ) : null}
                    </div>
                  </div>

                  {duplicates.length > 0 && !saved ? (
                    <p className="hp-small mb-3 text-warning-text">
                      {duplicates[0]} Tick it only if this is a separate payment.
                    </p>
                  ) : null}
                  {result && !result.ok ? (
                    <p role="alert" className="hp-small mb-3 text-danger-text">
                      {result.message}
                    </p>
                  ) : null}

                  {saved ? (
                    <p className="hp-small text-text-muted">
                      {KINDS.find((k) => k.value === kind)?.label}
                      {draft.amount ? ` · ${draft.amount}` : ''}
                      {draft.date ? ` · ${draft.date}` : ''}
                    </p>
                  ) : (
                    <>
                      <input
                        type="hidden"
                        name={`d${index}.target`}
                        value={
                          kind === 'expense' || kind === 'income' ? 'transaction' : kind
                        }
                      />
                      <input
                        type="hidden"
                        name={`d${index}.direction`}
                        value={kind === 'income' ? 'income' : 'expense'}
                      />
                      <SelectField
                        id={`kind-${index}`}
                        label="What is this?"
                        value={kind}
                        onChange={(e) =>
                          setKinds((prev) => ({
                            ...prev,
                            [index]: e.target.value as Kind,
                          }))
                        }
                        wrapClassName="mb-3"
                      >
                        {KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </SelectField>
                      <TextField
                        id={`name-${index}`}
                        name={`d${index}.name`}
                        label={NAME_LABEL[kind]}
                        defaultValue={draft.name ?? ''}
                        wrapClassName="mb-3"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <TextField
                          id={`amount-${index}`}
                          name={`d${index}.amount`}
                          label={`Amount (${currency})`}
                          inputMode="decimal"
                          defaultValue={draft.amount ?? ''}
                          wrapClassName="mb-3"
                          tone={uncertain ? 'warning' : 'default'}
                        />
                        <TextField
                          id={`date-${index}`}
                          name={`d${index}.date`}
                          label={DATE_LABEL[kind]}
                          type="date"
                          defaultValue={draft.date ?? ''}
                          wrapClassName="mb-3"
                        />
                      </div>
                      {kind !== 'receivable' ? (
                        <SelectField
                          id={`category-${index}`}
                          name={`d${index}.categoryId`}
                          label={
                            draft.categorySuggestion
                              ? `Category (read as “${draft.categorySuggestion}”)`
                              : 'Category'
                          }
                          defaultValue=""
                          wrapClassName="mb-1"
                        >
                          <option value="">No category</option>
                          {options.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </SelectField>
                      ) : null}
                      <input
                        type="hidden"
                        name={`d${index}.description`}
                        value={draft.description ?? ''}
                      />
                    </>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>

        {open.length > 0 ? (
          <Button
            type="submit"
            disabled={pending || tickedLive.length === 0}
            size="lg"
            className="mt-4 w-full"
          >
            {pending ? 'Saving…' : `Save ${tickedLive.length} selected`}
          </Button>
        ) : null}
        <p className="hp-small mt-2 text-text-muted">
          Your edits are what gets saved, not what was read.
        </p>
      </form>

      {open.length > 0 ? (
        <form action={discardExtractionAction} className="mt-3">
          <input type="hidden" name="extractionId" value={extractionId} />
          <input type="hidden" name="documentId" value={documentId} />
          <Button type="submit" variant="ghost" className="w-full">
            {savedCount > 0 ? 'Discard the rest' : 'Discard these details'}
          </Button>
        </form>
      ) : null}
    </>
  );
}
