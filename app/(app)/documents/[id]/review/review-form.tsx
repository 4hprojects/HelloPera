'use client';

import { useActionState, useState } from 'react';
import {
  confirmExtractionAction,
  discardExtractionAction,
} from '@/app/actions/extraction';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { LOW_CONFIDENCE_THRESHOLD } from '@/lib/ocr/schema';

const initial: ActionState = {};

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
 *
 * The confidence reading goes in the hint slot rather than a header row beside
 * the label: the floating label lives inside the field now, and the slot under
 * it already exists for exactly this kind of aside.
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

  const hint =
    confidence !== undefined
      ? `${Math.round(confidence * 100)}% sure${uncertain ? ' · check this' : ''}`
      : empty
        ? 'not found'
        : undefined;

  return (
    <TextField
      id={id}
      label={label}
      type={type}
      inputMode={inputMode}
      defaultValue={defaultValue ?? ''}
      hint={hint}
      tone={uncertain ? 'warning' : 'default'}
      wrapClassName="mb-4"
    />
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

        <SelectField
          id="target"
          label="What is this?"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          hint={
            suggestedTarget !== 'unknown' && suggestedTarget !== target
              ? `Read as “${TARGETS.find((t) => t.value === suggestedTarget)?.label}”. You have changed it.`
              : undefined
          }
          wrapClassName="mb-4"
        >
          {TARGETS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </SelectField>

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
            <SelectField
              id="accountId"
              label="Paid from"
              required
              hint={
                fields.paymentMethod
                  ? `The document mentions ${fields.paymentMethod}. Choose the matching account — it is a hint, not a selection.`
                  : undefined
              }
              wrapClassName="mb-4"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="categoryId"
              label="Category"
              defaultValue=""
              wrapClassName="mb-5"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
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
