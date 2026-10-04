'use client';

import { useActionState } from 'react';
import { updateAccountAction } from '@/app/actions/finance';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { EditModal, useCloseOnSuccess } from '@/components/ui/modal';
import { ArchiveAccountForm } from '@/components/finance/archive-account-form';
import { DeleteAccountForm } from '@/components/finance/delete-account-form';
import { BankFields } from '@/components/finance/bank-fields';
import { LOAN_FREQUENCIES } from '@/schemas/finance.schema';

export type EditableAccount = {
  id: string;
  name: string;
  isLoan: boolean;
  isBank: boolean;
  isArchived: boolean;
  bank: { kind: string | null; last4: string | null } | null;
  institutionName: string | null;
  loan: {
    paymentAmount: string;
    paymentFrequency: string;
    nextDueDate: string;
    principal: string | null;
    interestRateApr: string | null;
    termMonths: number | null;
  } | null;
};

const initial: ActionState = {};

export function EditAccount({ account }: { account: EditableAccount }) {
  return (
    <EditModal triggerLabel="Edit" title="Edit account">
      {(close) => <Form account={account} close={close} />}
    </EditModal>
  );
}

function Form({ account, close }: { account: EditableAccount; close: () => void }) {
  const [state, action, pending] = useActionState(updateAccountAction, initial);
  useCloseOnSuccess(state.success, close);
  const loan = account.loan;
  const id = account.id;

  return (
    <>
      <form action={action} noValidate>
        <input type="hidden" name="id" value={id} />
        {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

        <FormField
          id={`name-${id}`}
          name="name"
          label="Name"
          defaultValue={account.name}
          required
          hint="This is how the account appears when you pick it in transactions, bills and your dashboard."
          error={state.fieldErrors?.name}
        />
        {account.isBank ? (
          <BankFields
            idPrefix={`edit-${id}`}
            initial={{
              institution: account.institutionName ?? '',
              kind: account.bank?.kind ?? '',
              last4: account.bank?.last4 ?? '',
            }}
            errors={state.fieldErrors}
          />
        ) : (
          <FormField
            id={`institution-${id}`}
            name="institutionName"
            label={account.isLoan ? 'Lender' : 'Institution (optional)'}
            defaultValue={account.institutionName ?? ''}
            required={account.isLoan}
            error={state.fieldErrors?.institutionName}
          />
        )}

        {account.isLoan && loan ? (
          <>
            <FormField
              id={`paymentAmount-${id}`}
              name="paymentAmount"
              label="Payment amount"
              inputMode="decimal"
              defaultValue={loan.paymentAmount}
              required
              error={state.fieldErrors?.paymentAmount}
            />
            <SelectField
              id={`paymentFrequency-${id}`}
              name="paymentFrequency"
              label="How often"
              defaultValue={loan.paymentFrequency}
              wrapClassName="mb-4"
              error={state.fieldErrors?.paymentFrequency}
            >
              {LOAN_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </option>
              ))}
            </SelectField>
            <FormField
              id={`nextDueDate-${id}`}
              name="nextDueDate"
              label="Next due date"
              type="date"
              defaultValue={loan.nextDueDate}
              required
              error={state.fieldErrors?.nextDueDate}
            />
            <FormField
              id={`principal-${id}`}
              name="principal"
              label="Original amount (optional)"
              inputMode="decimal"
              defaultValue={loan.principal ?? ''}
              error={state.fieldErrors?.principal}
            />
            <FormField
              id={`interestRateApr-${id}`}
              name="interestRateApr"
              label="Interest rate APR % (optional)"
              inputMode="decimal"
              defaultValue={loan.interestRateApr ?? ''}
              error={state.fieldErrors?.interestRateApr}
            />
            <FormField
              id={`termMonths-${id}`}
              name="termMonths"
              label="Term in months (optional)"
              inputMode="numeric"
              defaultValue={loan.termMonths ?? ''}
              error={state.fieldErrors?.termMonths}
            />
          </>
        ) : null}

        <p className="hp-small mb-4 text-text-muted">
          Balance, type and currency come from your transactions and cannot be edited
          here.
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

      {/* Outside the edit form: nested forms are invalid HTML. */}
      <section className="mt-6 border-t border-border pt-2" aria-label="Manage account">
        <h3 className="hp-small mt-3 font-semibold uppercase tracking-wide text-text-muted">
          Manage account
        </h3>
        <ArchiveAccountForm id={id} archived={account.isArchived} />
        <DeleteAccountForm id={id} name={account.name} />
      </section>
    </>
  );
}
