'use client';

import { useActionState, useState } from 'react';
import {
  confirmExtractionAction,
  discardExtractionAction,
} from '@/app/actions/extraction';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { LOW_CONFIDENCE_THRESHOLD } from '@/lib/ocr/schema';

const initial: ActionState = {};

const selectClass =
  'w-full rounded-[var(--radius-hp)] border border-border-strong bg-surface px-3 py-2.5 text-[0.9375rem] text-text';

const TARGETS = [
  { value: 'transaction', label: 'An expense I already paid' },
  { value: 'bill', label: 'A bill I still owe' },
  { value: 'receivable', label: 'Money someone owes me' },
  { value: 'expected_income', label: 'Income I expect to receive' },
];

/**
 * A field with its extracted confidence shown in words.
 *
 * §19: confidence guides review, it does not bypass it. Low-confidence fields
 * are marked so the eye goes there first — but every field stays editable and
 * nothing is pre-trusted.
 */
function Field({
  id,
  label,
  defaultValue,
  confidence,
  type = 'text',
  inputMode,
}: {
  id: string;
  label: string;
  defaultValue?: string | null;
  confidence?: number;
  type?: string;
  inputMode?: 'decimal';
}) {
  const uncertain = confidence !== undefined && confidence < LOW_CONFIDENCE_THRESHOLD;
  const empty = !defaultValue;

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="mb-0">
          {label}
        </Label>
        {confidence !== undefined ? (
          <span
            className={`hp-small ${uncertain ? 'text-warning-text' : 'text-text-muted'}`}
          >
            {Math.round(confidence * 100)}% sure
            {uncertain ? ' · check this' : ''}
          </span>
        ) : empty ? (
          <span className="hp-small text-text-muted">not found</span>
        ) : null}
      </div>
      <Input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        defaultValue={defaultValue ?? ''}
        className={uncertain ? 'border-warning' : undefined}
      />
    </div>
  );
}

export function ReviewForm({
  extractionId,
  documentId,
  fields,
  confidence,
  suggestedTarget,
  currency,
  accounts,
  categories,
}: {
  extractionId: string;
  documentId: string;
  fields: Record<string, string | null>;
  confidence: Record<string, number>;
  suggestedTarget: string;
  currency: string;
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(confirmExtractionAction, initial);
  const [target, setTarget] = useState(
    TARGETS.some((t) => t.value === suggestedTarget) ? suggestedTarget : 'transaction',
  );

  const inferredCurrency = String(fields.currencyInferred) === 'true';

  return (
    <>
      <form action={action}>
        {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
        {state.success ? <FormAlert tone="success">{state.success}</FormAlert> : null}

        <input type="hidden" name="extractionId" value={extractionId} />
        <input type="hidden" name="documentId" value={documentId} />

        <div className="mb-4">
          <Label htmlFor="target">What is this?</Label>
          <select
            id="target"
            name="target"
            className={selectClass}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {TARGETS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {suggestedTarget !== 'unknown' && suggestedTarget !== target ? (
            <p className="hp-small mt-1 text-text-muted">
              Read as &ldquo;{TARGETS.find((t) => t.value === suggestedTarget)?.label}
              &rdquo;. You have changed it.
            </p>
          ) : null}
        </div>

        <Field
          id="amount"
          label={`Amount (${currency})`}
          defaultValue={fields.amount}
          confidence={confidence.amount}
          inputMode="decimal"
        />
        {inferredCurrency ? (
          <p className="hp-small -mt-2 mb-4 text-warning-text">
            No currency was printed on the document. {currency} was assumed.
          </p>
        ) : null}

        {target === 'transaction' ? (
          <>
            <Field
              id="merchantName"
              label="Merchant"
              defaultValue={fields.merchantName}
              confidence={confidence.merchantName}
            />
            <Field
              id="transactionDate"
              label="Date"
              type="date"
              defaultValue={fields.transactionDate}
              confidence={confidence.transactionDate}
            />
            <div className="mb-4">
              <Label htmlFor="accountId">Paid from</Label>
              <select id="accountId" name="accountId" className={selectClass} required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {fields.paymentMethod ? (
                <p className="hp-small mt-1 text-text-muted">
                  The document mentions {fields.paymentMethod}. Choose the matching
                  account — it is a hint, not a selection.
                </p>
              ) : null}
            </div>
            <div className="mb-5">
              <Label htmlFor="categoryId">Category</Label>
              <select
                id="categoryId"
                name="categoryId"
                className={selectClass}
                defaultValue=""
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        {target === 'bill' ? (
          <>
            <Field
              id="providerName"
              label="Provider"
              defaultValue={fields.providerName}
              confidence={confidence.providerName}
            />
            <Field
              id="dueDate"
              label="Due date"
              type="date"
              defaultValue={fields.dueDate}
              confidence={confidence.dueDate}
            />
          </>
        ) : null}

        {target === 'receivable' ? (
          <Field
            id="partyName"
            label="Who owes you"
            defaultValue={fields.partyName}
            confidence={confidence.partyName}
          />
        ) : null}

        {target === 'expected_income' ? (
          <>
            <Field
              id="providerName"
              label="Source"
              defaultValue={fields.providerName}
              confidence={confidence.providerName}
            />
            <Field
              id="expectedDate"
              label="Expected on"
              type="date"
              defaultValue={fields.expectedDate}
              confidence={confidence.expectedDate}
            />
          </>
        ) : null}

        <Button type="submit" disabled={pending} size="lg" className="w-full">
          {pending ? 'Saving…' : 'Confirm and save'}
        </Button>
        <p className="hp-small mt-2 text-text-muted">
          Your edits are what gets saved, not what was read.
        </p>
      </form>

      <form action={discardExtractionAction} className="mt-3">
        <input type="hidden" name="extractionId" value={extractionId} />
        <input type="hidden" name="documentId" value={documentId} />
        <Button type="submit" variant="ghost" className="w-full">
          Discard these details
        </Button>
      </form>
    </>
  );
}
