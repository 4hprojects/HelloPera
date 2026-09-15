'use client';

import { useActionState } from 'react';
import { createBillAction } from '@/app/actions/obligations';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';

const initial: ActionState = {};

export function NewBillForm({
  defaultCurrency,
  categories,
}: {
  defaultCurrency: string;
  categories: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(createBillAction, initial);

  return (
    <form action={action} noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <FormField
        id="providerName"
        label="Provider"
        required
        error={state.fieldErrors?.providerName}
      />
      <FormField
        id="amount"
        label="Amount due"
        inputMode="decimal"
        required
        error={state.fieldErrors?.amount}
      />
      <FormField
        id="dueDate"
        label="Due date"
        type="date"
        required
        error={state.fieldErrors?.dueDate}
      />

      <SelectField id="categoryId" label="Category" defaultValue="" wrapClassName="mb-4">
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>

      <FormField
        id="description"
        label="Description (optional)"
        error={state.fieldErrors?.description}
      />
      <input type="hidden" name="currencyCode" value={defaultCurrency} />

      <p className="hp-small mb-4 text-text-muted">
        Adding a bill does not record an expense. That happens when you pay it.
      </p>

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Saving…' : 'Add bill'}
      </Button>
    </form>
  );
}
