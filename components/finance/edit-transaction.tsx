'use client';

import { useActionState } from 'react';
import { updateTransactionAction } from '@/app/actions/finance';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField, TextareaField } from '@/components/ui/field';
import { EditModal, useCloseOnSuccess } from '@/components/ui/modal';

export type EditableTransaction = {
  id: string;
  type: string;
  amount: string;
  date: string;
  categoryId: string | null;
  merchantName: string | null;
  description: string | null;
  notes: string | null;
};
export type CategoryOption = {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
};

const initial: ActionState = {};

export function EditTransaction({
  transaction: tx,
  categories,
}: {
  transaction: EditableTransaction;
  categories: CategoryOption[];
}) {
  return (
    <EditModal triggerLabel="Edit" title="Edit transaction">
      {(close) => <Form tx={tx} categories={categories} close={close} />}
    </EditModal>
  );
}

function Form({
  tx,
  categories,
  close,
}: {
  tx: EditableTransaction;
  categories: CategoryOption[];
  close: () => void;
}) {
  const [state, action, pending] = useActionState(updateTransactionAction, initial);
  useCloseOnSuccess(state.success, close);

  const hasCategory = tx.type !== 'transfer' && tx.type !== 'adjustment';
  const options = categories.filter((c) =>
    tx.type === 'expense' ? c.type !== 'income' : c.type !== 'expense',
  );

  return (
    <form action={action} noValidate>
      <input type="hidden" name="id" value={tx.id} />
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <FormField
        id={`amount-${tx.id}`}
        name="amount"
        label="Amount"
        inputMode="decimal"
        defaultValue={tx.amount}
        required
        hint="Locked while this transaction settles a bill or receivable."
        error={state.fieldErrors?.amount}
      />
      <FormField
        id={`date-${tx.id}`}
        name="transactionDate"
        label="Date"
        type="date"
        defaultValue={tx.date}
        required
        error={state.fieldErrors?.transactionDate}
      />
      <FormField
        id={`merchant-${tx.id}`}
        name="merchantName"
        label="Merchant (optional)"
        defaultValue={tx.merchantName ?? ''}
        error={state.fieldErrors?.merchantName}
      />
      <FormField
        id={`description-${tx.id}`}
        name="description"
        label="Description (optional)"
        defaultValue={tx.description ?? ''}
        error={state.fieldErrors?.description}
      />
      {hasCategory ? (
        <SelectField
          id={`category-${tx.id}`}
          name="categoryId"
          label="Category"
          defaultValue={tx.categoryId ?? ''}
          wrapClassName="mb-4"
        >
          <option value="">No category</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      ) : null}
      <TextareaField
        id={`notes-${tx.id}`}
        name="notes"
        label="Notes (optional)"
        defaultValue={tx.notes ?? ''}
        rows={3}
        error={state.fieldErrors?.notes}
      />

      <p className="hp-small mb-4 text-text-muted">
        Type and accounts cannot be changed. To move a transaction to another account,
        void it and add a new one.
      </p>
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
