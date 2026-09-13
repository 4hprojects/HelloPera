# HelloPera — Phase 03: Bills, Receivables and Expected Income

## 1. Objective

Build HelloPera's obligation and expected-cash-flow layer.

At the end of this phase, an authenticated user should be able to:

- Create and track bills
- Record bill due dates
- Record partial or full bill payments
- Create and track receivables
- Record partial or full receivable collections
- Create expected income records
- Mark expected income as received
- Distinguish obligations from transactions
- Distinguish expected cash from actual cash
- Track overdue items
- View upcoming obligations
- Preserve links between obligations and actual payment transactions
- Maintain audit history and user data isolation

This phase extends the financial core without introducing OCR, recurring rules, or full forecasting yet.

---

## 2. Dependencies

Phase 03 requires Phase 02 to be complete.

Required Phase 02 outputs:

- Accounts
- Categories
- Transactions
- Transfers
- Refunds
- Adjustments
- Safe monetary handling
- Account balance engine
- Audit logs
- RLS
- User ownership checks

---

## 3. Scope

### Included

- Bills
- Bill statuses
- Bill due dates
- Bill payments
- Partial bill payments
- Receivables
- Receivable statuses
- Receivable partial collections
- Expected income
- Expected income status
- Actual income linking
- Overdue detection
- Upcoming due lists
- Basic reminders foundation
- Audit logs
- RLS
- Status transitions
- Payment link integrity

### Out of Scope

Do not implement yet:

- Recurring bills
- Recurring salary
- OCR-derived bills
- Document uploads
- Image processing
- Push notifications
- Full forecasting engine
- AI financial assistant
- Automated bank matching
- Payment gateway integration
- Invoice generation
- Contact CRM
- Debt amortization schedules
- Interest calculation
- Penalty computation

---

## 4. Core Modeling Rule

Keep these entities distinct:

```text
Obligation
↓
Actual Payment Transaction
```

A bill is not itself an expense transaction.

A receivable is not itself income.

Expected income is not actual income.

Only actual movement of money creates a transaction.

---

## 5. Example: Bill Flow

```text
Internet Bill
₱1,899
Due Sep 22
Status: upcoming
↓
User pays ₱1,000
↓
Payment transaction
₱1,000 from GCash
↓
Bill status: partially_paid
Remaining: ₱899
↓
User pays ₱899
↓
Second payment transaction
↓
Bill status: paid
```

---

## 6. Example: Receivable Flow

```text
Client owes
₱15,000
Due Sep 30
↓
Client pays ₱5,000
↓
Income transaction
₱5,000 into BPI
↓
Receivable status: partially_paid
Remaining: ₱10,000
```

---

## 7. Example: Expected Income Flow

```text
Expected Salary
₱30,000
Expected Sep 15
↓
Salary arrives
↓
Income transaction
₱30,000 into BPI
↓
Expected Income status: received
```

---

# BILLS

## 8. Bills Table

Suggested schema:

```text
bills

id
user_id
provider_name
description
category_id
amount
currency_code
due_date
status          -- open | partially_paid | paid | cancelled
notes
is_archived
created_at
updated_at
```

`status` persists **lifecycle only**. The four values above are the complete
stored set.

Time-based states — `upcoming`, `due_soon`, `due_today`, `overdue` — are
derived at read time from `due_date`, today's date and the remaining amount.
They are never stored. See §9.

Optional later fields:

```text
reference_number
account_number
document_id
recurring_rule_id
```

These may remain nullable or be deferred to later phases.

---

## 9. Bill Statuses

Suggested statuses:

```text
upcoming
due_soon
due_today
overdue
partially_paid
paid
cancelled
```

Important:

Some status values are derived from date + payment state.

Do not manually persist every display status if derivation is cleaner.

A recommended approach:

Persist core status such as:

```text
open
partially_paid
paid
cancelled
```

Then derive:

```text
upcoming
due_soon
due_today
overdue
```

from:

```text
due_date
current date
remaining amount
```

This avoids stale statuses.

---

## 10. Bill Amount

Store:

```text
amount
```

as safe decimal.

Also derive:

```text
paid_amount
remaining_amount
```

from linked bill payments.

Avoid storing mutable totals unless there is a clear cache strategy.

---

## 11. Bill Payments

Create a linking table:

```text
bill_payments

id
user_id
bill_id
transaction_id
amount_applied
created_at
```

The payment transaction itself should already exist in:

```text
transactions
```

The link explains which bill it paid.

---

## 12. Bill Payment Rules

A bill payment must:

- Belong to the same user
- Link to an eligible transaction
- Use matching currency unless conversion is explicitly supported
- Have `amount_applied > 0`
- Not exceed the remaining bill amount unless overpayment is explicitly supported
- Update bill status consistently
- Execute atomically with any required state updates

---

## 13. Bill Payment Transaction Type

A bill payment should generally use an existing transaction type such as:

```text
expense
```

or:

```text
transfer
```

depending on account modeling.

Example:

```text
Electric bill paid from GCash
→ expense transaction
```

Example:

```text
Credit card bill paid from BPI
→ transfer from asset to liability
```

The bill-payment link does not redefine the transaction type.

---

## 14. Credit Card Bill Consideration

A credit-card payment should not create duplicate expense.

The expense occurred when purchases were recorded.

Therefore:

```text
BPI → Credit Card
```

should be a liability-reducing transfer.

A bill may link to that transfer as payment.

This must remain consistent with Phase 02 liability behavior.

---

## 15. Bill Creation UI

Route:

```text
/bills/new
```

Fields:

```text
Provider
Description
Amount
Currency
Due Date
Category
Notes
```

Possible later fields:

```text
Reference Number
Account Number
Linked Document
```

---

## 16. Bill List

Route:

```text
/bills
```

Show:

- Provider
- Amount
- Remaining
- Due date
- Status
- Category

Filters:

```text
all
upcoming
due soon
overdue
partially paid
paid
cancelled
```

Sorting:

```text
nearest due
latest due
highest amount
lowest amount
```

---

## 17. Bill Detail

Route:

```text
/bills/[id]
```

Show:

- Provider
- Description
- Amount
- Paid amount
- Remaining amount
- Due date
- Status
- Category
- Notes
- Payment history
- Created date
- Updated date

Actions:

```text
Record Payment
Edit
Cancel
Archive
```

---

## 18. Partial Bill Payments

Supported.

Example:

```text
Bill = ₱10,000
Payment 1 = ₱4,000
Payment 2 = ₱3,000
Remaining = ₱3,000
```

Status:

```text
partially_paid
```

until remaining amount reaches zero.

---

## 19. Bill Cancellation

A bill may be cancelled if:

- It is no longer valid
- It was entered by mistake
- The obligation was waived

Cancellation should not delete related payment transactions.

If payments already exist, cancellation requires careful handling and should be audited.

---

## 20. Bill Overdue Logic

A bill is overdue if:

```text
due_date < today
AND
remaining_amount > 0
AND
status != cancelled
```

Timezone:

```text
Asia/Manila
```

for user-facing date comparisons by default.

---

# RECEIVABLES

## 21. Receivables Table

Suggested schema:

```text
receivables

id
user_id
party_name
description
amount
currency_code
due_date
status
notes
is_archived
created_at
updated_at
```

Possible later fields:

```text
contact_id
document_id
invoice_number
reference_number
```

---

## 22. Receivable Statuses

Suggested core statuses:

```text
pending
partially_paid
paid
cancelled
```

Derived display status:

```text
overdue
```

when:

```text
due_date < today
AND
remaining_amount > 0
AND
status != cancelled
```

---

## 23. Receivable Payments

Create linking table:

```text
receivable_payments

id
user_id
receivable_id
transaction_id
amount_applied
created_at
```

The linked transaction should normally be:

```text
income
```

---

## 24. Receivable Collection Rules

A receivable collection must:

- Belong to the same user
- Link to an income transaction
- Use matching currency
- Apply a positive amount
- Not exceed remaining balance unless overpayment is explicitly supported
- Update remaining balance consistently
- Update status atomically

---

## 25. Receivable Creation UI

Route:

```text
/receivables/new
```

Fields:

```text
Person / Client
Description
Amount
Currency
Due Date
Notes
```

---

## 26. Receivable List

Route:

```text
/receivables
```

Show:

- Party name
- Amount
- Collected
- Remaining
- Due date
- Status

Filters:

```text
pending
partially paid
overdue
paid
cancelled
```

---

## 27. Receivable Detail

Route:

```text
/receivables/[id]
```

Show:

- Party
- Description
- Amount
- Collected
- Remaining
- Due date
- Status
- Notes
- Payment history

Actions:

```text
Record Collection
Edit
Cancel
Archive
```

---

## 28. Partial Receivable Collections

Supported.

Example:

```text
Receivable = ₱20,000
Payment 1 = ₱5,000
Payment 2 = ₱5,000
Remaining = ₱10,000
```

Status:

```text
partially_paid
```

---

# EXPECTED INCOME

## 29. Expected Income Table

Suggested schema:

```text
expected_income

id
user_id
source_name
description
amount
currency_code
expected_date
category_id
status
notes
is_archived
created_at
updated_at
```

Persisted statuses:

```text
expected
partially_received
received
cancelled
```

`missed` is **derived**, not stored — see §34. A record is missed when its
expected date has passed and an amount remains outstanding. Storing it would
require a daily job whose only purpose is refreshing a label.

`partially_received` is persisted because it reflects real receipt records,
not the passage of time.

---

## 30. Expected Income vs Receivable

Keep both.

Use:

```text
receivable
```

when another person or entity owes the user a defined amount.

Use:

```text
expected_income
```

for anticipated income that is not necessarily debt owed.

Examples:

```text
Salary
Allowance
Expected stipend
Projected freelance payment before invoice
```

---

## 31. Expected Income Receipt

When expected income arrives:

1. Create actual income transaction.
2. Link expected income to transaction.
3. Mark expected income `received`.
4. Preserve expected vs actual date and amount for later analytics.

Suggested linking field:

```text
received_transaction_id
```

or separate linking table if partial receipt must be supported.

---

## 32. Partial Expected Income

Decision:

For Phase 03, support partial receipt if practical.

Preferred implementation:

Create:

```text
expected_income_receipts
```

similar to receivable payments.

If keeping Phase 03 simpler, expected income may be single-receipt only and partial expected income can use receivables.

Recommended: support multiple receipts because real-world salary/freelance/stipend deposits may arrive in parts.

---

## 33. Expected Income Receipt Table

Suggested:

```text
expected_income_receipts

id
user_id
expected_income_id
transaction_id
amount_applied
created_at
```

Then derive:

```text
received_amount
remaining_expected_amount
```

---

## 34. Expected Income Status Logic

Persisted lifecycle (§29):

```text
expected
partially_received
received
cancelled
```

Derived for display:

```text
missed
```

when:

```text
expected_date < today
AND
remaining_expected_amount > 0
AND
status != cancelled
```

Same split as bills (§9) and receivables (§22): lifecycle is stored, time is
computed.

---

# SHARED OBLIGATION LOGIC

## 35. Payment/Receipt Link Integrity

Each linking record must ensure:

- Same `user_id`
- Same currency
- Transaction exists
- Transaction is confirmed
- Transaction is not voided
- Applied amount is valid
- Total applied amount does not exceed transaction amount unless explicitly designed
- Total applied amount does not exceed obligation remaining balance

---

## 36. Transaction Reuse

One transaction may potentially apply to multiple obligations later.

Example:

```text
One bank payment
covers:
Internet ₱1,500
Mobile ₱500
```

For Phase 03, decide whether to allow split allocation.

Recommended:

Support it structurally by using link tables with `amount_applied`.

This allows:

```text
one transaction
→ multiple bills
```

and:

```text
one bill
→ multiple transactions
```

This is a strong long-term model.

---

## 37. Applied Amount Constraint

Two invariants must hold at all times:

```text
sum(amount_applied) for an obligation  <=  obligation amount
sum(amount_applied) for a transaction  <=  transaction amount
```

Neither can be expressed as a `CHECK`, because both are aggregates across
rows. Application-level checks alone are not enough either — see §74 for the
race they lose.

### The Allocation Function

All allocation goes through one `plpgsql` function. Nothing else writes
`bill_payments`, `receivable_payments` or `expected_income_receipts`.

```text
allocate_payment(obligation_type, obligation_id, transaction_id, amount)

BEGIN
  SELECT ... FROM <obligation> WHERE id = obligation_id FOR UPDATE;
    -- row lock held for the rest of the transaction

  SELECT ... FROM transactions WHERE id = transaction_id FOR UPDATE;

  verify both rows belong to the calling user
  verify currencies match
  verify the transaction is confirmed and not voided

  recompute applied totals for both sides INSIDE the lock
  reject if either invariant would be violated

  INSERT the link row
  recompute and persist the obligation lifecycle status
END
```

The `FOR UPDATE` is the mechanism. It serialises concurrent allocation
against the same obligation, so the second caller reads the first caller's
committed total rather than a stale one.

Read-then-write in application code cannot do this: between the read and the
write, another request has already read the same balance.

Phases 05 and 07 reuse this function rather than writing link rows directly.

---

## 38. Status Derivation

Prefer deriving time-based status.

Example:

```text
due soon
due today
overdue
```

should be computed from dates.

Persist lifecycle state:

```text
open
partially_paid
paid
cancelled
```

This avoids daily status update jobs just to keep labels fresh.

---

## 39. Due Soon Window

Configurable.

Suggested default:

```text
3 days
```

Do not hardcode throughout the UI.

Use:

```text
DUE_SOON_DAYS
```

or user preference later.

---

## 40. Upcoming Lists

Dashboard-ready queries should exist for:

```text
bills due soon
overdue bills
receivables due soon
overdue receivables
expected income upcoming
expected income missed
```

Full dashboard integration remains Phase 06.

---

## 41. Calendar Dates

Use:

```text
date
```

rather than timestamp where time-of-day is not meaningful.

Examples:

```text
bill due_date
receivable due_date
expected_income expected_date
```

This reduces timezone errors.

---

## 42. User Timezone

Default:

```text
Asia/Manila
```

Future user-configurable timezone may be added later.

---

## 43. Categories

Bills may use expense categories.

Expected income may use income categories.

Receivables may optionally use income categories.

Do not create duplicate category systems.

Reuse Phase 02 categories.

---

## 44. Accounts

Bills and receivables should not require an account until money actually moves.

At payment/collection time, the transaction determines the account.

This keeps obligations separate from actual cash movement.

---

## 45. Suggested Services

```text
services/
  bill.service.ts
  receivable.service.ts
  expected-income.service.ts
  obligation-allocation.service.ts
```

Reuse:

```text
transaction.service.ts
audit.service.ts
balance.service.ts
```

---

## 46. Data Access

No repository layer — see `PHASE-02` §39. Services own their queries.

All allocation writes route through the `allocate_payment` function in §37.

---

## 47. Validation Schemas

Suggested:

```text
schemas/
  bill.schema.ts
  bill-payment.schema.ts
  receivable.schema.ts
  receivable-payment.schema.ts
  expected-income.schema.ts
  expected-income-receipt.schema.ts
```

---

## 48. Bill Validation

Validate:

```text
amount > 0
valid currency
valid due date
valid category
valid ownership
provider required
```

Do not accept client-supplied:

```text
paid_amount
remaining_amount
user_id
```

as authoritative.

---

## 49. Receivable Validation

Validate:

```text
party name required
amount > 0
valid currency
valid due date
valid ownership
```

---

## 50. Expected Income Validation

Validate:

```text
source required
amount > 0
valid currency
valid expected date
valid income category
```

---

## 51. Editing Open Obligations

Users may edit:

- Description
- Provider/party/source
- Due/expected date
- Notes
- Category
- Amount

If payments already exist:

Changing total amount requires validation.

Example:

```text
Bill total = ₱10,000
Already paid = ₱7,000
```

User must not reduce total below:

```text
₱7,000
```

without first handling linked payments.

---

## 52. Cancel vs Archive

Use:

```text
cancel
```

when the financial obligation is no longer valid.

Use:

```text
archive
```

to hide completed/history items from normal lists.

Do not confuse them.

---

## 53. Deletion

Avoid hard deletion through normal user UI.

Prefer:

```text
cancel
archive
```

If an item has no linked payments and was created by mistake, a permanent delete may still be unnecessary.

Audit history is more valuable.

---

## 54. Audit Logging

Log:

```text
bill_created
bill_updated
bill_cancelled
bill_payment_linked
bill_payment_unlinked

receivable_created
receivable_updated
receivable_cancelled
receivable_payment_linked
receivable_payment_unlinked

expected_income_created
expected_income_updated
expected_income_received
expected_income_cancelled
```

---

## 55. Payment Unlinking

If a payment link is removed:

- Do not delete the transaction.
- Recalculate obligation remaining amount.
- Recalculate lifecycle status.
- Audit the unlink action.

If the transaction itself is voided:

All linked obligation totals must update.

This requires integration with Phase 02 transaction service.

---

## 56. Transaction Edit Integration

If a linked transaction amount is reduced below total applied amounts:

Block the edit or require allocation adjustment first.

Example:

```text
Transaction = ₱5,000
Applied to bills = ₱5,000
```

User cannot edit transaction to:

```text
₱3,000
```

without resolving allocations.

---

## 57. Transaction Void Integration

Before voiding a transaction:

- Detect bill payment links
- Detect receivable payment links
- Detect expected income receipt links

Then:

- Unlink atomically
- Recalculate obligations
- Void transaction
- Recalculate account balance
- Audit all effects

---

## 58. RLS Requirements

Enable RLS on:

```text
bills
bill_payments
receivables
receivable_payments
expected_income
expected_income_receipts
```

Policy shape, per the write-path rule (master plan §33):

```text
SELECT   where user_id = (select auth.uid())
INSERT   no policy for the browser role
UPDATE   no policy for the browser role
DELETE   no policy for the browser role
```

Link rows must also belong to the current user, and are written only by the
allocation function in §37 — never by a client insert. This matters more here
than elsewhere: a client able to insert `bill_payments` directly could mark
any bill paid without money moving.

---

## 59. Admin Privacy Rule

Admins should not automatically see users' bills, receivables, or expected income.

Admin operational access remains separate from private financial content.

---

## 60. Basic User Navigation

Add:

```text
Bills
Receivables
```

to app navigation.

Expected Income may appear under:

```text
Income
Planning
More
```

For Phase 03, a dedicated route is acceptable:

```text
/expected-income
```

---

## 61. Routes

Suggested:

```text
/bills
/bills/new
/bills/[id]
/bills/[id]/edit

/receivables
/receivables/new
/receivables/[id]
/receivables/[id]/edit

/expected-income
/expected-income/new
/expected-income/[id]
/expected-income/[id]/edit
```

---

## 62. Quick Actions

Add:

```text
+ Bill
+ Receivable
+ Expected Income
```

to relevant action menus.

---

## 63. Record Payment Flow

Example:

```text
Bill Detail
↓
Record Payment
↓
Choose:
Create New Transaction
or
Use Existing Transaction
↓
Select Account
↓
Amount
↓
Date
↓
Save
↓
Link transaction
↓
Update bill status
```

For MVP, "Create New Transaction" can be the primary path.

"Use Existing Transaction" is still useful for historical entry.

---

## 64. Record Collection Flow

```text
Receivable Detail
↓
Record Collection
↓
Create/Select Income Transaction
↓
Amount Applied
↓
Save
↓
Update receivable
```

---

## 65. Expected Income Receipt Flow

```text
Expected Income Detail
↓
Mark Received / Record Receipt
↓
Create/Select Income Transaction
↓
Apply Amount
↓
Update expected income status
```

---

## 66. Status Badges

Use HelloPera semantic colors.

Suggested:

```text
upcoming          → neutral
due soon          → gold
due today         → warning
overdue           → danger
partially paid    → jade/gold
paid              → success
cancelled         → muted

pending            → neutral
partially paid     → jade/gold
received           → success
missed             → danger
```

Do not use color alone.

---

## 67. Empty States

Examples:

```text
No bills yet
Add your first bill to track upcoming payments.
```

```text
No receivables yet
Track money that people or clients owe you.
```

```text
No expected income yet
Add expected salary, stipend, or freelance income.
```

---

## 68. Dashboard Preview Integration

Phase 03 may add lightweight dashboard sections:

```text
Upcoming Bills
Overdue Bills
Receivables
Expected Income
```

Do not build advanced analytics yet.

---

## 69. Search and Filters

Bills:

```text
provider
description
status
due date
category
```

Receivables:

```text
party name
description
status
due date
```

Expected Income:

```text
source
description
status
expected date
```

---

## 70. Sorting

Support:

```text
nearest date
latest date
highest amount
lowest amount
```

---

## 71. Currency Handling

Do not link a transaction to an obligation if the currencies differ.

Cross-currency settlement is permanently out of scope — HelloPera does not
convert (master plan §11). This is not a deferral waiting on FX support.

If a user has:

```text
USD receivable
```

the payment transaction must also be:

```text
USD
```

The allocation function (§37) enforces this. A user who genuinely receives
pesos against a dollar receivable should record the peso income and close the
receivable with a note — HelloPera will not invent a rate on their behalf.

---

## 72. Decimal Precision

Use the same safe monetary rules from Phase 02.

Applied amounts must use exact decimal handling.

---

## 73. Idempotency

Payment-link creation should avoid accidental duplicates.

Possible safeguards:

- Unique operation ID
- Disable submit while saving
- Check duplicate link
- Database uniqueness where appropriate

---

## 74. Concurrency

Two payment requests arriving nearly simultaneously must not over-apply.

Example problem to prevent:

```text
Bill remaining = ₱1,000

Payment A = ₱1,000
Payment B = ₱1,000

Both should not succeed simultaneously.
```

Without a lock, both requests read "remaining ₱1,000", both conclude their
payment fits, and both insert. The bill ends up ₱2,000 paid against a ₱1,000
obligation.

This is solved by the allocation function in §37, not by a general
instruction to use transactions. A transaction alone at READ COMMITTED does
not prevent this — the row lock does.

Test it: fire two concurrent allocations against the same obligation and
confirm exactly one succeeds.

---

## 75. Error Handling

Examples:

```text
This bill is already fully paid.
Payment exceeds remaining balance.
This transaction is already fully allocated.
Currencies do not match.
This receivable has already been collected.
The linked transaction is voided.
Unable to update obligation.
```

---

## 76. Notifications Foundation

Do not send push notifications yet.

Prepare queries/helpers for:

```text
due soon
overdue
missed expected income
```

Phase 08 will turn these into scheduled notifications.

---

## 77. Testing Checklist

### Bills

- [ ] Create bill
- [ ] Edit bill
- [ ] Cancel bill
- [ ] Archive bill
- [ ] Due date stored correctly
- [ ] Due soon derived correctly
- [ ] Due today derived correctly
- [ ] Overdue derived correctly

### Bill Payments

- [ ] Create full payment
- [ ] Create partial payment
- [ ] Multiple payments supported
- [ ] Remaining amount correct
- [ ] Paid status correct
- [ ] Overpayment blocked
- [ ] Currency mismatch blocked
- [ ] Linked expense works
- [ ] Linked liability transfer works

### Receivables

- [ ] Create receivable
- [ ] Edit receivable
- [ ] Cancel receivable
- [ ] Partial collection works
- [ ] Multiple collections work
- [ ] Remaining amount correct
- [ ] Overdue derived correctly
- [ ] Over-collection blocked

### Expected Income

- [ ] Create expected income
- [ ] Edit expected income
- [ ] Record receipt
- [ ] Partial receipt works if implemented
- [ ] Received amount correct
- [ ] Missed status derived correctly
- [ ] Actual income transaction linked

### Transaction Integration

- [ ] Linked transaction edit validation works
- [ ] Linked transaction void updates obligations
- [ ] Payment unlinking works
- [ ] Transaction is not deleted when link removed
- [ ] Account balance remains correct

### Concurrency

- [ ] Two simultaneous full payments against one bill — exactly one succeeds
- [ ] Two simultaneous collections against one receivable — exactly one succeeds
- [ ] Over-allocating a transaction across two obligations is refused
- [ ] Allocation function rejects a cross-user obligation/transaction pair

### RLS

- [ ] User A cannot access User B bills
- [ ] User A cannot access User B receivables
- [ ] User A cannot access User B expected income
- [ ] User A cannot create payment link to User B transaction
- [ ] Direct anon-key INSERT into `bill_payments` is refused by the database

### Audit

- [ ] Bill changes logged
- [ ] Receivable changes logged
- [ ] Expected income changes logged
- [ ] Payment links logged
- [ ] Unlinks logged

### Production

- [ ] Migrations apply successfully
- [ ] HelloDeploy build succeeds
- [ ] Bill payment works in production
- [ ] Receivable collection works in production
- [ ] Expected income receipt works in production

---

## 78. Deployment Checks

Before completing Phase 03:

- [ ] `DATA-MODEL.md` updated in the same commit as the migration
- [ ] Database migrations committed
- [ ] RLS enabled
- [ ] Policies reviewed
- [ ] Payment allocation logic deployed
- [ ] Transaction service integration tested
- [ ] Production build succeeds
- [ ] HelloDeploy deployment succeeds
- [ ] Due-date calculations use intended timezone
- [ ] No private financial data exposed to admin by default

---

## 79. Acceptance Criteria

Phase 03 is complete only when:

1. Users can create bills.
2. Users can record bill due dates.
3. Users can record full bill payments.
4. Users can record partial bill payments.
5. Bill remaining balances are correct.
6. Bill lifecycle status is correct.
7. Due soon and overdue states derive correctly.
8. Users can create receivables.
9. Users can record partial receivable collections.
10. Users can fully collect receivables.
11. Receivable remaining balances are correct.
12. Users can create expected income.
13. Expected income can be linked to actual income transactions.
14. Expected income status updates correctly.
15. Obligations remain separate from transactions.
16. Applied payment amounts cannot exceed available amounts, including
    under concurrent requests.
17. All allocation goes through the locking function in §37.
18. Currency mismatches are blocked.
19. Transaction edits respect linked allocations.
20. Voiding linked transactions safely updates obligations.
21. Audit history records significant obligation changes.
22. RLS protects all obligation records, granting the browser SELECT only.
23. Admin does not gain unrestricted access to private financial content.

---

## 80. Definition of Done

Phase 03 is considered done when:

```text
HelloPera can accurately track
what the user owes,
what others owe the user,
what income is expected,
and how actual transactions settle those obligations
without corrupting balances or duplicating income/expenses.
```

The application should then be ready to begin:

```text
Phase 04 — Documents and Image Processing
```

Do not proceed to Phase 04 until all Phase 03 acceptance criteria pass.
