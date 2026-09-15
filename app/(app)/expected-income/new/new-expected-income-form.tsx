'use client';

import { useActionState } from 'react';
import { createExpectedIncomeAction } from '@/app/actions/obligations';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';

const initial: ActionState = {};

export function NewExpectedIncomeForm({
  defaultCurrency,
  categories,
}: {
  defaultCurrency: string;
  categories: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(createExpectedIncomeAction, initial);
  return (
    <form action={action} noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      <FormField
        id="sourceName"
        label="Source"
        required
        error={state.fieldErrors?.sourceName}
      />
      <FormField
        id="amount"
        label="Amount"
        inputMode="decimal"
        required
        error={state.fieldErrors?.amount}
      />
      <FormField
        id="expectedDate"
        label="Expected on"
        type="date"
        required
        error={state.fieldErrors?.expectedDate}
      />
      <SelectField id="categoryId" label="Category" defaultValue="" wrapClassName="mb-4">
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <input type="hidden" name="currencyCode" value={defaultCurrency} />
      <p className="hp-small mb-4 text-text-muted">
        Expected income is a plan, not a balance. It affects nothing until it arrives.
      </p>
      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Saving…' : 'Add expected income'}
      </Button>
    </form>
  );
}
