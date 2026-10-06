'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { updateObligationAction } from '@/app/actions/obligations';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField, TextareaField } from '@/components/ui/field';
import { EditModal, useCloseOnSuccess } from '@/components/ui/modal';
import { FREQUENCIES, FREQUENCY_OPTION_LABEL } from '@/lib/recurring/schedule';

export type EditableObligation = {
  id: string;
  kind: 'bill' | 'receivable' | 'expected_income';
  name: string;
  amount: string;
  date: string | null;
  description: string | null;
  notes: string | null;
  categoryId: string | null;
  installmentAmount: string | null;
  installmentCount: number | null;
  installmentsPrior: number;
  borrowedDate: string | null;
  /** Expected income only: set when a recurring rule generated this record. */
  recurringRuleId?: string | null;
  /** "Monthly", from `describeRule`; shown beside the repeat controls. */
  cadence?: string | null;
};

const initial: ActionState = {};

const WORDING = {
  bill: { name: 'Provider', amount: 'Amount', date: 'Due date', title: 'Edit bill' },
  receivable: {
    name: 'Who owes you',
    amount: 'Amount',
    date: 'Due date (optional)',
    title: 'Edit receivable',
  },
  expected_income: {
    name: 'Source',
    amount: 'Estimated amount',
    date: 'Estimated date',
    title: 'Edit expected income',
  },
} as const;

export function EditObligation({
  item,
  categories,
}: {
  item: EditableObligation;
  categories: Array<{ id: string; name: string }>;
}) {
  return (
    <EditModal triggerLabel="Edit" title={WORDING[item.kind].title}>
      {(close) => <Form item={item} categories={categories} close={close} />}
    </EditModal>
  );
}

function Form({
  item,
  categories,
  close,
}: {
  item: EditableObligation;
  categories: Array<{ id: string; name: string }>;
  close: () => void;
}) {
  const [state, action, pending] = useActionState(updateObligationAction, initial);
  useCloseOnSuccess(state.success, close);
  const words = WORDING[item.kind];
  const [frequency, setFrequency] = useState('');

  return (
    <form action={action} noValidate>
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="kind" value={item.kind} />
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <FormField
        id={`name-${item.id}`}
        name="name"
        label={words.name}
        defaultValue={item.name}
        required
        error={state.fieldErrors?.name}
      />
      <FormField
        id={`amount-${item.id}`}
        name="amount"
        label={words.amount}
        inputMode="decimal"
        defaultValue={item.amount}
        required
        hint={
          item.kind === 'expected_income'
            ? 'Pay came in different? Set the real amount here before you record it. Cannot be less than what is already recorded.'
            : 'Cannot be less than what is already recorded against it.'
        }
        error={state.fieldErrors?.amount}
      />
      {item.kind === 'receivable' ? (
        <FormField
          id={`borrowedDate-${item.id}`}
          name="borrowedDate"
          label="Date borrowed (optional)"
          type="date"
          defaultValue={item.borrowedDate ?? ''}
          error={state.fieldErrors?.borrowedDate}
        />
      ) : null}
      <FormField
        id={`date-${item.id}`}
        name="date"
        label={words.date}
        type="date"
        defaultValue={item.date ?? ''}
        required={item.kind !== 'receivable'}
        error={state.fieldErrors?.date}
      />
      {item.kind === 'bill' ? (
        <>
          <FormField
            id={`installmentAmount-${item.id}`}
            name="installmentAmount"
            label="Monthly payment (optional)"
            inputMode="decimal"
            defaultValue={item.installmentAmount ?? ''}
            hint="Leave both blank for a one-time bill."
            error={state.fieldErrors?.installmentAmount}
          />
          <FormField
            id={`installmentCount-${item.id}`}
            name="installmentCount"
            label="Number of months (optional)"
            inputMode="numeric"
            defaultValue={item.installmentCount ?? ''}
            error={state.fieldErrors?.installmentCount}
          />
          <FormField
            id={`installmentsPrior-${item.id}`}
            name="installmentsPrior"
            label="Payments already made before this bill (optional)"
            inputMode="numeric"
            defaultValue={item.installmentsPrior || ''}
            error={state.fieldErrors?.installmentsPrior}
          />
        </>
      ) : null}
      {item.kind === 'expected_income' && item.recurringRuleId ? (
        <fieldset className="mb-4">
          <legend className="hp-small mb-1 font-medium text-text">
            Repeats {item.cadence ? item.cadence.toLowerCase() : ''}
          </legend>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="scope" value="this" defaultChecked />
            Apply changes to this pay date only
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="scope" value="future" />
            Apply to this and all later pay dates
          </label>
          <p className="hp-small text-text-muted">
            Dates stay as they are. To change how often it repeats or when it ends, edit
            the{' '}
            <Link
              href={`/recurring/${item.recurringRuleId}`}
              className="text-primary-text underline"
            >
              repeating rule
            </Link>
            .
          </p>
        </fieldset>
      ) : null}
      {item.kind === 'expected_income' && !item.recurringRuleId ? (
        <>
          <SelectField
            id={`frequency-${item.id}`}
            name="frequency"
            label="Repeats"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            hint="Choose how often to repeat from this date. Each later pay date uses this estimate."
            wrapClassName="mb-4"
          >
            <option value="">Does not repeat</option>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_OPTION_LABEL[f]}
              </option>
            ))}
          </SelectField>
          {frequency ? (
            <FormField
              id={`endDate-${item.id}`}
              name="endDate"
              label="Ends (optional)"
              type="date"
              error={state.fieldErrors?.endDate}
            />
          ) : null}
        </>
      ) : null}
      {item.kind !== 'receivable' ? (
        <SelectField
          id={`category-${item.id}`}
          name="categoryId"
          label="Category"
          defaultValue={item.categoryId ?? ''}
          wrapClassName="mb-4"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      ) : null}
      <FormField
        id={`description-${item.id}`}
        name="description"
        label="Description (optional)"
        defaultValue={item.description ?? ''}
        error={state.fieldErrors?.description}
      />
      <TextareaField
        id={`notes-${item.id}`}
        name="notes"
        label="Notes (optional)"
        defaultValue={item.notes ?? ''}
        rows={3}
        error={state.fieldErrors?.notes}
      />

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
