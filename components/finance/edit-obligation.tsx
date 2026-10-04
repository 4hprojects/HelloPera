'use client';

import { useActionState } from 'react';
import { updateObligationAction } from '@/app/actions/obligations';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField, TextareaField } from '@/components/ui/field';
import { EditModal, useCloseOnSuccess } from '@/components/ui/modal';

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
};

const initial: ActionState = {};

const WORDING = {
  bill: { name: 'Provider', date: 'Due date', title: 'Edit bill' },
  receivable: {
    name: 'Who owes you',
    date: 'Due date (optional)',
    title: 'Edit receivable',
  },
  expected_income: {
    name: 'Source',
    date: 'Expected date',
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
        label="Amount"
        inputMode="decimal"
        defaultValue={item.amount}
        required
        hint="Cannot be less than what is already recorded against it."
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
