'use client';
import { useActionState, useState, useTransition } from 'react';
import {
  recordPaymentAction,
  searchPaymentCandidatesAction,
} from '@/app/actions/obligations';
import { FormAlert } from '@/components/auth/form-alert';
import { TextField, SelectField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import type { ObligationKind, PaymentCandidate } from '@/services/obligation.service';

type Page = { items: PaymentCandidate[]; next: string | null };

type Props = {
  kind: ObligationKind;
  id: string;
  amount: string;
  today: string;
  currency: string;
  accounts: { id: string; name: string }[];
  initialCandidates: Page;
};

/**
 * Each payment gets its own request key. A retry after an error re-submits the
 * same form (same key, so it can never record twice); "Record another payment"
 * mounts a fresh form with a new key.
 */
export function PaymentForm(props: Props) {
  const [attempt, setAttempt] = useState(() => crypto.randomUUID());
  return (
    <PaymentFormInner
      key={attempt}
      {...props}
      requestId={attempt}
      onAnother={() => setAttempt(crypto.randomUUID())}
    />
  );
}

function PaymentFormInner({
  kind,
  id,
  amount,
  today,
  currency,
  requestId,
  accounts,
  initialCandidates,
  onAnother,
}: Props & { requestId: string; onAnother: () => void }) {
  const [state, action, pending] = useActionState(recordPaymentAction, {});
  const [mode, setMode] = useState('new');
  const [page, setPage] = useState<Page>(initialCandidates);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  function load(cursor: string | null, term: string, append: boolean) {
    startLoading(async () => {
      const result = await searchPaymentCandidatesAction({
        kind,
        currency,
        search: term,
        cursor,
      });
      if (result.error) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      setPage((prev) => ({
        items: append ? [...prev.items, ...result.items] : result.items,
        next: result.next,
      }));
    });
  }

  if (state.success)
    return (
      <div className="space-y-3">
        <FormAlert tone="success">{state.success}</FormAlert>
        <Button type="button" variant="secondary" onClick={onAnother}>
          Record another payment
        </Button>
      </div>
    );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="obligationType" value={kind} />
      <input type="hidden" name="obligationId" value={id} />
      <input type="hidden" name="requestId" value={requestId} />
      {state.error && (
        <FormAlert tone="error">
          {state.error} Your entries are kept, and submitting again will not record the
          payment twice.
        </FormAlert>
      )}
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
        <>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField
                id="candidateSearch"
                // Client-side search only. An empty name keeps it out of the
                // payment submission, which rejects fields it does not read.
                name=""
                label="Search transactions"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    load(null, search, false);
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => load(null, search, false)}
            >
              Search
            </Button>
          </div>
          <SelectField
            id="transactionId"
            label="Existing transaction"
            required
            error={state.fieldErrors?.transactionId}
          >
            <option value="">Choose a confirmed transaction</option>
            {page.items.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </SelectField>
          <p className="hp-small text-text-muted" aria-live="polite">
            {loadError
              ? loadError
              : page.items.length === 0
                ? 'No matching transactions have an amount left to link.'
                : 'Only transactions with an amount left to link are shown.'}
          </p>
          {page.next && (
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => load(page.next, search, true)}
            >
              {loading ? 'Loading…' : 'Show older transactions'}
            </Button>
          )}
        </>
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
