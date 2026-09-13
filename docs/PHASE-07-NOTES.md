# Phase 07 — implementation notes

Decisions taken while building recurring rules and forecasting that a reader of
`PHASE-07-RECURRING-FORECASTING.md` would otherwise have to reverse-engineer.

---

## 1. What already existed, and what was missing

The database layer had been built ahead of the application: `recurring_rules`,
`expected_events`, `job_runs`, four RPCs, and the pure date math in
`lib/recurring/schedule.ts` with 33 tests.

What it did not have was anything that *ran* them. `generate_occurrence`
inserts one occurrence for one rule; `begin_job`/`finish_job` do the §20a
bookkeeping; nothing chose the dates or called them in a loop, and no schedule
called anything. The result applied cleanly, passed its tests, and generated
nothing — the kind of gap that is invisible until someone asks why their rule
did not fire.

`run_recurring_generation()` is that missing piece.

## 2. Date arithmetic is now in SQL too, and why that reversal was necessary

The Phase 07 RPC migration's header states the position plainly:

> The date arithmetic is NOT here. It lives in `lib/recurring/schedule.ts` […]
> SQL computes nothing it cannot be tested on.

That was right while SQL only inserted an occurrence it was handed. It cannot
survive §2's decision. HelloDeploy has no scheduler, so generation runs inside
Postgres via `pg_cron` — and a job with no application in the loop must decide
*which* dates to generate by itself.

So `occurrence_at()` is a second implementation, and
`lib/recurring/sql-parity.test.ts` holds it to the same answers as the
TypeScript across every frequency, interval, month-end clamp, leap year and
weekday shift. This is the device `lib/finance/sql-parity.test.ts` already uses
for the balance matrix, and it exists for the same reason: two hand-written
copies of one rule is how a ledger comes to show a number its own repair job
disagrees with.

**The anchor rule is the part to preserve if either copy is ever rewritten.**
Occurrence N is computed from the rule's *start date*, never from occurrence
N−1. A rule on the 31st clamps to 28 February; a generator that then asks "what
is one month after the 28th?" answers 28 March, and the rule has silently moved
to the 28th forever. Anchoring means February clamps and March does not.

## 3. The advisory lock was split across two round trips

`begin_job` takes a **session-level** `pg_try_advisory_lock` and `finish_job`
releases it in a **separate** RPC call.

For `pg_cron` that is fine: one session runs the whole job. Under a pooler it
is not. Supavisor can route the two calls to different backends, so the unlock
lands on a session that never held the lock, and the real holder leaks it until
the connection recycles — after which the job is silently skipped every run,
because `pg_try_advisory_lock` keeps returning false.

Every fallback §2 names — a scheduled Edge Function, an endpoint called by
GitHub Actions — is HTTP-shaped and would hit exactly this. So
`run_recurring_generation()` takes, holds and releases the lock inside one
function body.

The lock key is also **per-user for a scoped run** and global only for the
scheduled one. The lazy check (§19) runs a user-scoped generation on every
`/forecast` load; had it taken the global key, one user opening the page would
make every other user's on-load generation skip — contention over work that
never overlaps, since the two runs touch different rows entirely.

Worth keeping in view: **the lock is not what makes generation correct.** §65
is explicit that the unique constraints are the guarantee and the lock is the
optimisation. If the lock were lost entirely, two concurrent runs would still
produce one occurrence each, because `unique (recurring_rule_id,
scheduled_date)` rejects the duplicate and `generate_occurrence` returns null.

## 4. Three columns the schema was missing

`DATA-MODEL.md` documented `detached_from_rule`, `source_entity_type` and
`source_entity_id` on `expected_events`. The migration never created them, so
the consolidated schema reference described a table that had never shipped.

`detached_from_rule` is the one that mattered: without it, §66 has no
mechanism, and `rebuildFutureOccurrences` would erase a user's hand-edited
occurrence on the next regeneration. It now spares three things — anything
fulfilled, anything dated today or earlier, and anything detached.

## 5. Generation runs hourly, not daily

§20 asks for "at least daily". Hourly, because rules belong to users in
different timezones and the job resolves "today" per user from
`profiles.timezone`. A daily UTC run would generate a day early or late for
everyone not on UTC; an hourly pass catches each local midnight within the
hour.

`cron.schedule` fires in UTC and the job never derives a date from that — §2's
warning, followed literally.

## 6. pg_cron is guarded, because correctness must not depend on it

The extension is not available on every Supabase plan, and a migration that
hard-failed there would block every migration after it. The schedule is created
inside an exception-guarded block that downgrades to a warning.

This is safe precisely because generation is also triggered lazily: `/forecast`
runs a user-scoped generation on load (§19), and `/recurring` offers a manual
"Check for new". Cron governs *timeliness*, not correctness. A deployment with
no scheduler at all still produces the right occurrences — just later.

The lazy check deliberately swallows its own error. A generation failure is a
reason to show a slightly stale forecast, not to replace the page with an error
message; the failure is recorded in `job_runs` either way.

## 7. Filters and forms that would otherwise disagree with themselves

**`day_of_month` is optional and derived from the start date.** §58 offers
"requires day_of_month, or derive from start_date". Deriving wins: asking twice
for something the start date already states is a question with one correct
answer, and a form that can disagree with itself invites the disagreement.

What *is* validated is that a value the user supplied can be reached — a
`day_of_week` on a monthly rule is ignored by the generator, and being ignored
silently is the problem. The user set it deliberately and would never learn it
did nothing.

**Rule status is derived, never stored.** §14 offers a column but notes it
"could be derived". Derived wins for the reason Phase 03 derives obligation
lateness: `ended` is a function of today and `end_date`, so a stored copy is
wrong between the moment it becomes true and the job that notices — and "is
this rule still running?" is the question the screen exists to answer.

## 8. What the forecast excludes, and the one that is easy to get wrong

Skipped and cancelled occurrences are out (§41, §42). `include_in_forecast`
lets a user drop an uncertain one without skipping it (§43).

The subtle one is **fulfilled**. A fulfilled event has already become a real
transaction that moved the balance. Counting it again charges the user twice
for the same money, and the resulting projection is internally consistent and
quietly wrong — §70's "fulfilled events not double-counted", which is a test
because it is not obvious.

`includesEvent()` is one function used by both the page and the dashboard card,
so the two cannot diverge on this.

## 9. Shortfall reports the first date, not the worst

§55 asks for "the first date it occurs". The first crossing is the deadline the
user can still act on; the trough is merely the most alarming number. A dip
that a later inflow recovers from is still reported, because recovery does not
undo a payment bouncing on the 16th.

The copy states the date and the amount and stops there — §54 asks for no
alarmist language, and a projected shortfall is information to act on rather
than something to flinch at.

## 10. Currency separation is structural, not remembered

`lib/money` throws when two currencies meet, so a combined projection is not a
discipline anyone has to maintain — it is impossible to write. §46 is the place
this matters most: a fabricated combined balance in a *forecast* is a number
someone would plan a month around.

`lib/forecast/project.test.ts` pins it with an assertion that the mixed case
throws, so the guarantee survives a future refactor of the money layer.

## 11. Horizons are 30/60/90 only

§34 excludes longer windows deliberately, and the reason is worth repeating
because someone will eventually ask for a year: a salary rule set today says
nothing reliable about next August, and a twelve-month projection presented
with the same confidence as a thirty-day one invites planning against a number
the system cannot stand behind.

§34 also caps what Phase 09 may sell — free 30 days, premium 90. Extending the
horizon means editing §34 first and the entitlement second.

## 12. What running it actually found

The SQL was written before any database was available to run it. It was later
executed against a real Postgres 18 (a portable server in a scratch directory,
with `auth`, `storage` and the Supabase roles stubbed in), and that run changed
three things.

### Verified

- **All 13 migrations apply cleanly to a fresh database**, in order.
- **The pg_cron guard works.** Without the extension the migration emits its
  warning and still applies — so a plan without `pg_cron` is not blocked.
- **The anchor rule survives the SQL port.** A bill anchored to the 31st
  generated 31 Jan → 28 Feb → **31 Mar** → 30 Apr → 31 May. That is the whole
  reason the module exists, now confirmed in the database rather than only in
  TypeScript.
- **Generation is idempotent.** Three consecutive runs left the occurrence set
  byte-identical (`created: 0` after the first).
- **Concurrency holds.** Two simultaneous sessions: one worked, the other
  returned `{"skipped": true, "reason": "locked"}`.
- **`job_runs` records every run** with status and duration, and a skipped run
  correctly writes no row.
- **RLS isolates users** in both directions, and `job_runs` denies the browser
  role outright.

### Found: generation invented eight overdue bills

Seeding the cursor at `start_date` meant a rule whose start date was in the
past generated its entire history on first run. A monthly bill "started
January", created in September, produced **eight back-dated `open` bills** —
every one of them counted as overdue on the dashboard.

A user entering "Internet, monthly on the 31st, started January" is saying when
the real subscription began. They are not asking for eight unpaid bills to be
created behind them. `initialCursor` now starts at the first occurrence on or
after **today**, with the start date still the anchor so month-end clamping is
untouched. Catch-up is unaffected: the generator honours whatever the cursor
holds, so a scheduler that has not run for three days still fills them in.

This was invisible to unit tests because each one asserted its own dates; only
running the whole job against a seeded database made the shape obvious.

### Found: every SECURITY DEFINER function was callable by any browser

The serious one, and it long predates Phase 07 — see
`20260914000200_revoke_function_execute_from_public.sql`.

Since Phase 02 the protective idiom has been:

```sql
revoke all on function public.create_account from anon, authenticated;
```

which does nothing. Postgres grants EXECUTE to **PUBLIC** by default, and those
roles never held a grant of their own to revoke. Sixteen functions were
reachable from any browser through PostgREST's `/rpc/`, and none checks
`auth.uid()` — deliberately, because the write-path rule says only server
actions may call them, so they take the owning `user_id` as a parameter and
trust it.

Signed in as an ordinary user, both of these succeeded:

```sql
select public.create_account('<other user>','PWNED','cash','asset','PHP',999999,null);
select public.advance_rule_cursor('<other user rule>','2030-01-01');
```

The first created a ₱999,999 account owned by someone else. The second stopped
another user's rule for four years.

**RLS was never what failed.** These functions run as their owner, so RLS does
not apply to them at all; EXECUTE was the only barrier, and it had never
actually been withdrawn. A reviewer reading the migrations would see a revoke
statement on every function and reasonably conclude they were closed.

The fix revokes from `public`, grants EXECUTE back to `service_role` for the
seven RPCs the app calls, and sets `alter default privileges` so the next
function is not born exposed — without that last part it would be fixed once
rather than fixed.

## 13. Still unverified

- **Whether `pg_cron` is available on this project's Supabase plan.** §2 calls
  it the plan's highest-risk assumption and it remains one. The guard means a
  plan without it still applies every migration, and the §19 lazy check keeps
  generation correct — cron governs timeliness, not correctness.
- **Nothing has been applied to the remote project.** The verification above
  ran against a local throwaway database.
- **`services/analytics.integration.test.ts` has not been run**, because it
  creates real auth users in the live project. Its Phase 07 equivalent — RLS
  isolation — was verified locally instead.
