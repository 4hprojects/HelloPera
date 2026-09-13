'use client';

import { useActionState } from 'react';
import { createBillAction } from '@/app/actions/obligations';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const initial: ActionState = {};
const selectClass =
  'w-full rounded-[var(--radius-hp)] border border-border-strong bg-surface px-3 py-2.5 text-[0.9375rem] text-text';

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

      <div className="mb-4">
        <Label htmlFor="categoryId">Category</Label>
        <select id="categoryId" name="categoryId" className={selectClass} defaultValue="">
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

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
