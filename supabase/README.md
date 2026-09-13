# Database

## One-time setup

Add to `.env.local`:

```dotenv
# Dashboard > Settings > Database > Connection string > URI
# Use the POOLER host, not db.<ref>.supabase.co (IPv6-only).
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-N-<region>.pooler.supabase.com:5432/postgres

# Dashboard > Settings > API > service_role
SUPABASE_SERVICE_ROLE_KEY=<key>
```

Then:

```sh
npm run db:status     # what is applied, what is pending
npm run db:migrate    # apply pending migrations
npm run db:verify     # check RLS is actually enforced
```

Each migration runs in a single transaction. A failure applies nothing from
that file, so a broken migration cannot leave the schema half-changed.

## Migrations

| File                                                 | Phase | Creates                                                                             |
| ---------------------------------------------------- | ----- | ----------------------------------------------------------------------------------- |
| `20260913000100_phase01_profiles_and_audit.sql`      | 01    | `profiles`, `audit_logs`, signup trigger, RLS                                       |
| `20260913000200_phase02_financial_core.sql`          | 02    | `accounts`, `categories`, `transactions`, `tags`, balance function, seed categories |
| `20260913000300_phase02_transaction_rpc.sql`         | 02    | Atomic transaction RPCs                                                             |
| `20260913000400_lock_schema_migrations.sql`          | 02    | Locks down the migration ledger                                                     |
| `20260913000500_reject_income_to_liability.sql`      | 02    | Guard against income landing on a liability                                         |
| `20260913000600_phase03_obligations.sql`             | 03    | `bills`, `receivables`, `expected_income`, payment links                            |
| `20260913000700_void_updates_obligations.sql`        | 03    | Voiding a transaction reopens what it paid                                          |
| `20260913000800_phase04_documents.sql`               | 04    | `documents`, storage policies                                                       |
| `20260913000900_phase05_ocr_extraction.sql`          | 05    | `extractions`, OCR job state                                                        |
| `20260913001000_phase07_recurring_forecasting.sql`   | 07    | `recurring_rules`, `expected_events`, `job_runs`                                    |
| `20260913001100_phase07_generation_rpc.sql`          | 07    | `generate_occurrence`, `advance_rule_cursor`, job bookkeeping                       |
| `20260914000100_phase07_generation_orchestrator.sql` | 07    | `occurrence_at`, `run_recurring_generation`, `pg_cron` schedule                     |

Phase 06 added no migrations — it is read-only analytics over what already
exists, and its index review (`docs/PHASE-06-NOTES.md` §5) found the seven
indexes it needed already present.

All migrations are idempotent — re-running one is safe.

`supabase/ALL-MIGRATIONS.sql` is a generated bundle of the above, for the
Supabase SQL Editor where there is no runner. Regenerate it with
`npm run db:bundle` after adding a migration — never edit it by hand.

## After the first migration

Promote yourself to admin with `ADMIN-BOOTSTRAP.sql`. Register through the app
first, then follow the steps in that file. It writes the audit row in the same
transaction as the role change, because a privilege grant with no record of who
made it or why is the one you will most want to explain later.

## What `db:verify` checks

`VERIFY-RLS.sql` asserts the things that are easy to believe and hard to
notice when wrong:

- RLS is **forced**, not merely enabled — without `force`, the table owner bypasses it
- No `INSERT`/`UPDATE`/`DELETE` policy exists for `authenticated`
- `auth.uid()` is wrapped in a subselect, so it is evaluated once per query rather than once per row
- `anon` holds no privileges at all
- The signup trigger exists and is armed
- `SECURITY DEFINER` functions pin `search_path` — one that does not is exploitable

A test that only confirms the UI hides a control proves nothing. These
exercise the database directly.

## Balance integrity

`recalculate_account_balance(account_id)` derives the authoritative balance
from confirmed transactions. It deliberately ignores `accounts.opening_balance`
— the opening amount lives in an `opening_balance` **transaction**, and summing
both would make every account wrong by exactly its opening amount.

That function contains a second implementation of the balance matrix in
`lib/finance/balance.ts`. `lib/finance/sql-parity.test.ts` proves the two agree
across all 72 combinations. If you change one, change the other and re-run
`npm test`.
