# HelloPera — Phase 07: Recurring Transactions and Forecasting

## 1. Objective

Build HelloPera's recurring-event engine and deterministic financial forecasting layer.

At the end of this phase, an authenticated user should be able to:

- Create recurring income rules
- Create recurring expense rules
- Create recurring bill rules
- Create recurring expected-income rules
- Generate future expected financial events
- Review upcoming recurring obligations
- Forecast projected account/cash position
- Separate actual transactions from expected future events
- See projected balances over time
- Understand which future events drive the forecast
- Prevent duplicate recurring-event generation
- Pause, resume, edit, and end recurring rules
- Preserve audit history

This phase should help users plan ahead without using AI as the authoritative calculation engine.

---

## 2. Dependencies

Phase 07 requires Phase 06 to be complete.

Required prior capabilities:

- Accounts
- Transactions
- Bills
- Receivables
- Expected income
- Dashboard
- Analytics
- Safe monetary handling
- Currency handling
- Audit logs
- RLS
- User authentication

### Scheduling Must Already Be Resolved

Phase 07 is the first phase that cannot work without scheduled execution. Do
not begin it until row **S1** of `PLATFORM-HELLODEPLOY.md` is settled —
verified in Phase 00, but confirm it still holds.

**HelloDeploy has no scheduler.** Scheduled jobs and background worker
products are both explicitly deferred in its blueprint
(`PLATFORM-HELLODEPLOY.md`, row S1). This was the plan's highest-risk
assumption and it did not hold.

### Decision: Supabase `pg_cron`

```text
Scheduling runs in Postgres, not in the application container.
```

Chosen because scheduled work here is database-shaped — generating
occurrence rows, evaluating due dates, recomputing obligation status — and
because it survives container restarts and redeploys, which an in-process
timer does not.

This applies to Phase 08's reminders and Phase 11's billing reconciliation
too. One mechanism, several jobs.

**Confirm during Phase 00** that `pg_cron` is available on the chosen
Supabase plan, and enable it:

```sql
create extension if not exists pg_cron;

select cron.schedule(
  'recurring_generation',
  '0 * * * *',                          -- hourly, UTC
  $$ select public.run_recurring_generation() $$
);
```

Notes that matter:

- **`cron.schedule` is UTC.** Phase 07's dates are Asia/Manila. Compute
  user-local boundaries inside the function from `profiles.timezone`; never
  infer them from the cron time.
- **The job body is a function call, not inline logic.** Keeps the schedule
  stable while the logic changes, and makes the same function callable
  manually for testing and admin replay (`PHASE-13` §50).
- **Jobs still take the advisory lock in §20a.** `pg_cron` will start a run
  even if the previous one is still going.
- **Keep the work short**, or chunk it. A long-running job holds a connection
  and its locks for the duration.

If `pg_cron` turns out to be unavailable, the fallbacks in order are: a
Supabase scheduled Edge Function calling a secured endpoint; an in-process
`node-cron` inside the container (works today — HelloDeploy is
single-replica — but dies with the container); or a scheduled GitHub Actions
workflow calling the endpoint with `SCHEDULER_SECRET`.

---

## 3. Scope

### Included

- Recurring financial rules
- Recurring income
- Recurring expense
- Recurring bill
- Recurring expected income
- Rule frequency
- Start date
- Optional end date
- Pause/resume
- Rule activation/deactivation
- Expected-event generation
- Duplicate generation protection
- Forecast horizon
- Projected cash flow
- Projected balance
- Forecast timeline
- Forecast assumptions display
- Manual inclusion/exclusion of expected events
- Audit logging
- RLS

### Out of Scope

Do not implement yet:

- AI financial advice
- Machine-learning forecasts
- Bank syncing
- Automatic external bill detection
- Recurring receivables from invoices
- Investment forecasting
- FX forecasting
- Interest-rate projections
- Inflation models
- Tax forecasts
- Shared family forecasts
- Push notifications
- Subscription billing

---

## 4. Core Principle

Recurring rules create:

```text
Expected Events
```

They do not automatically create:

```text
Actual Transactions
```

Actual money movement must remain separate.

---

## 5. Example

Recurring rule:

```text
Internet
₱1,799
Monthly
Every 8th
```

System generates:

```text
Expected Bill
Oct 8
₱1,799
```

When user actually pays:

```text
Expense transaction
or
linked bill payment
```

The expected event is then marked fulfilled or linked to the actual event.

---

## 6. Recurring Rule Types

Suggested types:

```text
income
expense
bill
expected_income
```

Avoid using one ambiguous generic type without clear target behavior.

---

## 7. Recurring Rules Table

Suggested schema:

```text
recurring_rules

id
user_id
rule_type
name
description
amount
currency_code
frequency
interval_count
start_date
end_date
next_occurrence_date
account_id
category_id
provider_name
source_name
is_active
is_paused
created_at
updated_at
```

Optional future fields:

```text
day_of_month
day_of_week
timezone
metadata jsonb
```

---

## 8. Frequency

Initial supported frequencies:

```text
weekly
monthly
quarterly
yearly
```

Optional:

```text
biweekly
```

Avoid overly complex RRULE-style recurrence unless there is a clear need.

---

## 9. Interval Count

Support:

```text
every 1 month
every 2 weeks
every 3 months
```

using:

```text
interval_count
```

Example:

```text
frequency = monthly
interval_count = 3
```

means quarterly-like recurrence.

---

## 10. Monthly Rule Dates

Monthly rules may specify:

```text
day_of_month
```

Examples:

```text
8
15
30
```

Need behavior for months without that day.

Recommended:

```text
Use last valid day of month
```

Example:

```text
31st
→ Feb 28/29
```

Document this clearly.

---

## 11. Weekly Rules

Weekly rules may specify:

```text
day_of_week
```

Example:

```text
Monday
Friday
```

Use a normalized integer or enum.

---

## 12. Rule Start Date

Required:

```text
start_date
```

No expected occurrences before this date.

---

## 13. Rule End Date

Optional:

```text
end_date
```

If null:

```text
continues until paused/disabled
```

---

## 14. Rule Status

Suggested:

```text
active
paused
ended
```

Could be derived from fields rather than separate status column.

Do not physically delete rules with history.

---

## 15. Expected Events Table

Create a generated-events table.

Suggested schema:

```text
expected_events

id
user_id
recurring_rule_id
event_type
name
amount
currency_code
scheduled_date
status
source_entity_type
source_entity_id
actual_transaction_id
created_at
updated_at
```

Possible statuses:

```text
scheduled
fulfilled
skipped
cancelled
overdue
```

---

## 16. Event Types

Suggested:

```text
income
expense
bill
expected_income
```

If rule creates a bill, the system may generate:

```text
bill record
```

instead of a generic expected event.

Two viable architectures:

### Option A

All recurring rules generate `expected_events`.

### Option B

Rules generate native domain objects:

```text
bill
expected_income
```

Recommended hybrid:

- Recurring `bill` creates a bill.
- Recurring `expected_income` creates expected_income.
- Recurring `income/expense` may create expected_events until fulfilled.

This should be documented in implementation.

---

## 17. Generation Horizon

Generate expected events ahead for a configurable horizon.

Suggested:

```text
90 days
```

Do not generate years of future rows unnecessarily.

---

## 18. Idempotent Generation

Critical rule:

A recurring rule must not generate the same occurrence twice.

Recommended unique constraint:

```text
(recurring_rule_id, scheduled_date)
```

for generated expected events.

For generated bills/expected income, store:

```text
recurring_rule_id
occurrence_date
```

with a uniqueness constraint.

---

## 19. Generation Trigger

Possible initial strategies:

```text
on app access
scheduled daily job
manual refresh
```

Recommended:

- Server-side scheduled generation daily
- Plus lazy safety check when forecast loads

Do not depend only on user opening the app.

---

## 20. Scheduled Execution

Use the mechanism resolved in §2.

Need:

```text
generate recurring occurrences
```

at least daily.

---

## 20a. Job Runs and Overlap Protection

Phase 07 introduces the scheduled-job infrastructure that Phases 08, 11 and
13 all reuse. It belongs here because this is the first scheduler; deferring
it to Phase 13 would mean two phases running unprotected in the meantime.

### `job_runs`

```text
job_runs

id
job_type
status              -- running | succeeded | failed | partial
started_at
completed_at
duration_ms
error_code
metadata jsonb
```

Job types grow by phase:

```text
recurring_generation      Phase 07
notification_generation   Phase 08
notification_delivery     Phase 08
billing_reconciliation    Phase 11
storage_cleanup           Phase 13
document_retention        Phase 14
```

### Overlap Protection

Two scheduler instances can fire at once — a retry overlapping a slow run, or
two hosts both believing they own the schedule. Every job therefore takes a
Postgres advisory lock keyed on its type:

```text
SELECT pg_try_advisory_lock(hashtext('recurring_generation'));

  false → another run holds it; exit without error
  true  → INSERT job_runs (status = running)
          do the work
          UPDATE job_runs with outcome
          release the lock
```

An advisory lock is released automatically if the session dies, so a crashed
run does not wedge the schedule — which a lock table would.

This is defence in depth, not the primary guard. The uniqueness constraint in
§18 is what makes generation correct; the lock stops two runs wasting effort
and racing on the same rows.

`PHASE-13` §48–51 builds the admin view over this table rather than
introducing it.

---

## 21. Pausing a Rule

Pause should:

- Stop future occurrence generation
- Keep historical occurrences
- Keep previously generated near-future occurrences unless user chooses to cancel them

Need clear UI.

---

## 22. Resuming a Rule

Resume should:

- Continue from next valid recurrence
- Not backfill unintended historical events unless explicitly chosen

---

## 23. Editing a Rule

Changes can affect future events.

Recommended:

- Past fulfilled events remain unchanged.
- Future unfulfilled generated events may be regenerated after confirmation.
- User should be warned before changing amount/date/frequency.

---

## 24. Ending a Rule

End should:

- Stop generation after end date
- Preserve historical events

---

## 25. Recurring Income

Example:

```text
Salary
₱30,000
Monthly
15th
```

Creates expected future income.

It must not increase actual balances until received.

---

## 26. Recurring Expense

Example:

```text
Gym
₱1,200
Monthly
5th
```

Creates expected expense.

No actual balance effect until confirmed/recorded.

---

## 27. Recurring Bill

Example:

```text
Internet
₱1,799
Monthly
8th
```

Should create future bill records.

Bill lifecycle then follows Phase 03.

---

## 28. Recurring Expected Income

Example:

```text
DOST stipend
₱30,000
Monthly
```

Creates expected income records.

Receipt later links to actual income transaction.

---

## 29. Forecasting Principle

Forecasting must be deterministic.

Core idea:

```text
Projected Balance
=
Current Balance
+ Future Expected Inflows
- Future Expected Outflows
```

No AI is required for authoritative computation.

---

## 30. Forecast Inputs

Include:

```text
Current account balances
Expected income
Recurring income
Outstanding receivables optionally
Upcoming bills
Recurring expenses
Recurring bills
Expected scheduled expenses
```

Need explicit inclusion rules.

---

## 31. Default Forecast Policy

Recommended:

Include:

```text
Current liquid asset balances
Expected income
Upcoming bills
Recurring expected income
Recurring expenses
Recurring bills
```

Receivables should be optionally included because collection is less certain.

Use:

```text
Include Receivables
toggle
```

default possibly off.

---

## 32. Liquid Accounts

Forecast should focus on liquid asset accounts.

Examples:

```text
Cash
Bank
GCash
Maya
PayPal
```

Investment accounts may be excluded from cash-flow forecast by default.

---

## 33. Liability Accounts

Forecast can include debt payments as outflows.

Do not treat liability account balance itself as cash.

---

## 34. Forecast Horizon

Phase 07 implements exactly three:

```text
30 days
60 days
90 days
```

Longer horizons — 6 months, 12 months — are deliberately excluded. They
extrapolate recurring rules far past any evidence that the rules still hold:
a salary rule set today says nothing reliable about next August, and a
projection presented with the same confidence as a 30-day one invites the
user to plan against a number the system cannot stand behind.

If a longer horizon is added later, it should be presented differently from
the short-range forecast — wider, clearly labelled as an extrapolation, and
not treated as a planning figure.

### Note for Phase 09

`PHASE-09` §24 must not sell a horizon this phase does not build. The
entitlement is capped at what exists:

```text
Free      30 days
Premium   90 days
```

Selling a 12-month forecast would mean either shipping a projection whose
reliability this section explicitly doubts, or advertising a feature that
does not exist. If a longer horizon is wanted later, extend this section
first and the entitlement second.

---

## 35. Forecast Timeline

Display projected balance by date.

Example:

```text
Sep 15  +₱30,000 Salary
Sep 18  -₱2,845 Electricity
Sep 20  -₱1,799 Internet
Sep 25  -₱7,500 Loan

Projected Sep 30:
₱48,200
```

---

## 36. Forecast Data Point

Suggested structure:

```text
date
opening_projected_balance
inflows
outflows
closing_projected_balance
events[]
```

---

## 37. Forecast Service

Create:

```text
services/forecast.service.ts
services/recurring-rule.service.ts
services/expected-event.service.ts
```

---

## 38. Suggested Forecast Functions

Conceptual:

```text
getForecast()
generateOccurrences()
getUpcomingExpectedEvents()
fulfillExpectedEvent()
skipExpectedEvent()
rebuildFutureOccurrences()
```

---

## 39. Fulfillment

When actual transaction occurs:

Expected event can be linked to:

```text
actual_transaction_id
```

and marked:

```text
fulfilled
```

---

## 40. Fulfillment Matching

Phase 07 may support manual linking only.

Automatic matching can be added later.

Possible hints:

```text
same amount
near scheduled date
same category
same account
```

Do not auto-link without confirmation.

---

## 41. Skipping Occurrence

User may mark expected event:

```text
skipped
```

Example:

```text
subscription paused this month
```

Skipped event must not affect forecast.

---

## 42. Cancelling Future Occurrence

User may cancel one generated occurrence without ending the whole recurring rule.

Keep distinction:

```text
skip one occurrence
vs
pause rule
vs
end rule
```

---

## 43. Forecast Inclusion Flag

Each expected event may have:

```text
include_in_forecast
```

default true.

User can exclude uncertain events.

---

## 44. Forecast Confidence

Do not present false precision.

Suggested labels:

```text
Scheduled
Expected
Optional
```

Receivables may be marked less certain.

Avoid AI-style confidence percentages unless grounded.

---

## 45. Forecast Assumptions

Display:

```text
Includes scheduled bills and expected income
Receivables excluded by default
No currency conversion applied
Only PHP events shown
```

This improves trust.

---

## 46. Mixed Currency

Forecast separately by currency, with a currency selector on `/forecast`.

Never combine:

```text
PHP
USD
```

HelloPera does not convert (master plan §11). A combined projected balance
would be a fabricated number, and a forecast is exactly the place a user is
most likely to act on one.

---

## 47. Date Handling

Use:

```text
date
```

for scheduled occurrence date.

Timezone default:

```text
Asia/Manila
```

---

## 48. Recurring Rule UI

Route:

```text
/recurring
```

Show:

- Name
- Type
- Amount
- Frequency
- Next occurrence
- Status

---

## 49. Create Rule Route

```text
/recurring/new
```

Fields:

```text
Type
Name
Amount
Currency
Frequency
Interval
Start Date
Optional End Date
Account
Category
Provider/Source
```

Dynamic fields depend on type.

---

## 50. Rule Detail

Route:

```text
/recurring/[id]
```

Show:

- Rule definition
- Next occurrence
- Generated occurrences
- Fulfilled occurrences
- Status
- Edit
- Pause
- Resume
- End

---

## 51. Forecast Route

```text
/forecast
```

Show:

- Current liquid balance
- Projected ending balance
- Inflows
- Outflows
- Timeline
- Upcoming events
- Horizon selector
- Currency selector
- Include receivables toggle

---

## 52. Dashboard Integration

Add lightweight card:

```text
Projected 30-Day Balance
```

Link to:

```text
/forecast
```

Do not overcrowd dashboard.

---

## 53. Forecast Chart

Potential:

```text
Line chart of projected balance
```

Must include textual timeline.

Do not rely only on chart.

---

## 54. Negative Projected Balance

If projected balance goes below zero:

Show:

```text
Projected shortfall
```

and the first date it occurs.

Do not use alarmist language.

---

## 55. Forecast Shortfall

Example:

```text
Projected balance may fall below ₱0 on Sep 24.
```

Show contributing events.

---

## 56. Account-Level Forecast

Phase 07 may forecast aggregate liquid balance first.

Optional:

```text
forecast by account
```

Can be added if easy.

Do not block phase completion on it.

---

## 57. Rule Validation

Validate:

```text
amount > 0
valid currency
valid start date
valid frequency
interval_count >= 1
end_date >= start_date
ownership of account/category
```

---

## 58. Frequency Validation

Prevent invalid combinations.

Example:

```text
monthly
requires day_of_month
```

or derive from start_date.

Document approach.

---

## 59. Generation Safety

Do not generate occurrence before:

```text
start_date
```

Do not generate after:

```text
end_date
```

Do not generate while paused.

---

## 60. Duplicate Protection

Database uniqueness required.

Example:

```text
unique(recurring_rule_id, scheduled_date)
```

or equivalent per generated entity type.

---

## 61. Audit Events

Suggested:

```text
recurring_rule_created
recurring_rule_updated
recurring_rule_paused
recurring_rule_resumed
recurring_rule_ended
expected_event_generated
expected_event_fulfilled
expected_event_skipped
expected_event_cancelled
```

---

## 62. RLS

Enable RLS on:

```text
recurring_rules
expected_events
```

Policy shape, per the write-path rule (master plan §33):

```text
SELECT   where user_id = (select auth.uid())
INSERT   no policy for the browser role
UPDATE   no policy for the browser role
DELETE   no policy for the browser role
```

Generated bills and expected income inherit the Phase 03 policies.

`job_runs` is operational, not user-owned: no browser access at all, read in
the admin UI through a server action.

---

## 63. Admin Privacy

Admin should not automatically see user recurring rules or forecast data.

Keep operational admin separate.

---

## 64. Idempotency

Generation process must be idempotent.

Running generator twice should produce same occurrence set.

This is mandatory.

---

## 65. Concurrency

Two schedulers must not create duplicate occurrences.

Two independent guards, both required:

1. **Uniqueness** — `unique(recurring_rule_id, scheduled_date)` per §18 and
   §60. This is what makes the outcome correct even if both runs proceed.
2. **Advisory lock** — §20a. This stops the second run from doing the work
   at all.

The constraint is the guarantee; the lock is the optimisation. Do not ship
only the lock, because a lock can be lost and a constraint cannot.

---

## 66. Editing Generated Future Events

If user manually edits a generated bill or expected event:

Mark:

```text
detached_from_rule = true
```

or equivalent.

Otherwise later regeneration might overwrite user edits.

Need clear policy.

---

## 67. Rule Change Propagation

Recommended:

When rule changes:

```text
Ask:
Apply to future generated events?
```

Past/fulfilled events never change.

---

## 68. Error Handling

Examples:

```text
Unable to create recurring rule.
This occurrence already exists.
Invalid recurrence date.
Unable to generate forecast.
This rule has already ended.
```

---

## 69. Performance

Forecast query should aggregate server-side.

Do not load all future events into browser and recompute authoritative totals client-side.

---

## 70. Testing Checklist

### Recurring Rules

- [ ] Create recurring income
- [ ] Create recurring expense
- [ ] Create recurring bill
- [ ] Create recurring expected income
- [ ] Weekly frequency works
- [ ] Monthly frequency works
- [ ] Quarterly frequency works
- [ ] Yearly frequency works
- [ ] Start date respected
- [ ] End date respected
- [ ] Pause works
- [ ] Resume works
- [ ] End works

### Generation

- [ ] Future occurrence generated
- [ ] Duplicate generation prevented
- [ ] Paused rule generates nothing new
- [ ] Ended rule generates nothing new
- [ ] Month-end rule behaves correctly
- [ ] Generator is idempotent
- [ ] Concurrent generation does not duplicate

### Bills

- [ ] Recurring bill creates bill
- [ ] Bill due date correct
- [ ] Generated bill follows normal bill lifecycle

### Expected Income

- [ ] Recurring expected income creates expected-income record
- [ ] Receipt links correctly
- [ ] Fulfilled event removed from future forecast

### Expected Expense/Income

- [ ] Expected event generated
- [ ] Manual fulfill works
- [ ] Skip works
- [ ] Cancel single occurrence works

### Forecast

- [ ] 30-day forecast works
- [ ] 60-day forecast works
- [ ] 90-day forecast works
- [ ] Current balance correct
- [ ] Expected income included
- [ ] Upcoming bills included
- [ ] Recurring expenses included
- [ ] Receivables toggle works
- [ ] Fulfilled events not double-counted
- [ ] Skipped events excluded
- [ ] Mixed currencies separated

### Shortfall

- [ ] Negative projected balance identified
- [ ] First shortfall date correct
- [ ] Contributing events visible

### RLS

- [ ] User A cannot access User B recurring rules
- [ ] User A cannot access User B forecast events
- [ ] User A cannot fulfill User B event

### Job Infrastructure

- [ ] `job_runs` records every run with status and duration
- [ ] Advisory lock prevents a second concurrent run of the same job type
- [ ] A crashed run releases its lock and does not block the next schedule
- [ ] A failed run records `error_code` and is visible for replay

### Production

- [ ] Scheduler works in production
- [ ] HelloDeploy deployment succeeds
- [ ] Daily generation works
- [ ] Forecast performance acceptable
- [ ] No duplicate scheduled events after repeated runs

---

## 71. Deployment Checks

Before completing Phase 07:

- [ ] Scheduling mechanism from §2 confirmed in production
- [ ] `DATA-MODEL.md` updated in the same commit as the migration
- [ ] Recurring-rule migration applied
- [ ] Expected-event migration applied
- [ ] `job_runs` migration applied
- [ ] RLS enabled
- [ ] Unique occurrence constraints deployed
- [ ] Scheduler configured
- [ ] Scheduler tested in production
- [ ] Forecast service deployed
- [ ] 30/60/90-day forecasts tested
- [ ] Mixed-currency behavior tested
- [ ] Rule pause/resume tested
- [ ] Duplicate generation tested
- [ ] Production build succeeds

---

## 72. Acceptance Criteria

Phase 07 is complete only when:

1. Users can create recurring income rules.
2. Users can create recurring expense rules.
3. Users can create recurring bill rules.
4. Users can create recurring expected-income rules.
5. Users can pause recurring rules.
6. Users can resume recurring rules.
7. Users can end recurring rules.
8. Future occurrences are generated correctly.
9. Duplicate occurrences are prevented.
10. Recurring bills create normal bill records.
11. Recurring expected income creates normal expected-income records.
12. Expected events remain separate from actual transactions.
13. Users can fulfill expected events with actual transactions.
14. Users can skip individual occurrences.
15. Users can cancel individual occurrences.
16. Forecasts include configured expected inflows/outflows.
17. Forecasts use deterministic calculations.
18. Receivables can be optionally included.
19. Mixed currencies are forecast separately.
20. Projected shortfalls are identified.
21. Forecast assumptions are visible.
22. RLS protects all recurring and forecast records.
23. Scheduler is idempotent.
24. `job_runs` records every scheduled run.
25. Overlapping runs of the same job type are prevented.
26. The forecast horizon matches what Phase 09 is permitted to sell.
27. Production scheduling works through the chosen infrastructure.

---

## 73. Definition of Done

Phase 07 is considered done when:

```text
HelloPera can model recurring financial behavior,
generate future expected events,
and produce transparent deterministic forecasts
without confusing planned activity with actual money movement.
```

The application should then be ready to begin:

```text
Phase 08 — Notifications and Automation
```

Do not proceed to Phase 08 until all Phase 07 acceptance criteria pass.
