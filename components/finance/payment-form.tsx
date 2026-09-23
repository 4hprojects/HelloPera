'use client';
import { useActionState, useState } from 'react';
import { recordPaymentAction } from '@/app/actions/obligations';
import { FormAlert } from '@/components/auth/form-alert';
import { TextField, SelectField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import type { ObligationKind } from '@/services/obligation.service';

export function PaymentForm({
  kind,
  id,
  amount,
  today,
  requestId,
  accounts,
  transactions,
}: {
  kind: ObligationKind;
  id: string;
  amount: string;
  today: string;
  requestId: string;
  accounts: { id: string; name: string }[];
  transactions: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(recordPaymentAction, {});
  const [mode, setMode] = useState('new');
  if (state.success)
    return (
      <FormAlert tone="success">
        {state.success} Reload this page to record another payment.
      </FormAlert>
    );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="obligationType" value={kind} />
      <input type="hidden" name="obligationId" value={id} />
      <input type="hidden" name="requestId" value={requestId} />
      {state.error && <FormAlert tone="error">{state.error}</FormAlert>}
      <SelectField
        id="mode"
        label="Record money moved"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        <option value="new">Create a transaction</option>
        <option value="existing">Link an existing transaction</option>
      </SelectField>
      <TextField
        id="amount"
        label="Amount paid or received"
        inputMode="decimal"
        defaultValue={amount}
        required
        error={state.fieldErrors?.amount}
      />
      {mode === 'new' ? (
        <>
          <SelectField
            id="accountId"
            label="Account"
            required
            error={state.fieldErrors?.accountId}
          >
            <option value="">Choose an account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
          <TextField
            id="transactionDate"
            label="Payment date"
            type="date"
            defaultValue={today}
            required
            error={state.fieldErrors?.transactionDate}
          />
        </>
      ) : (
        <SelectField
          id="transactionId"
          label="Existing transaction"
          required
          error={state.fieldErrors?.transactionId}
        >
          <option value="">Choose a confirmed transaction</option>
          {transactions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </SelectField>
      )}
      <p className="hp-small text-text-muted">
        Record only money that has already moved. Linking an existing transaction does not
        change your balance again.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? 'Recording…' : 'Record payment'}
      </Button>
    </form>
  );
}
