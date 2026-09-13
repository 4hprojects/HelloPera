# HelloPera — Phase 02: Financial Core

## 1. Objective

Build the core financial engine for HelloPera.

At the end of this phase, an authenticated user should be able to:

- Create and manage financial accounts
- Create and manage categories
- Record manual income
- Record manual expenses
- Record transfers between accounts
- Record refunds
- Record adjustments
- View account balances
- View transaction history
- Filter transactions
- Edit permitted transaction fields
- Archive transactions safely
- Preserve financial integrity
- Track audit history
- Use PHP as the default currency while keeping the schema ready for multi-currency

This phase must produce a usable manual personal finance tracker even before bills, OCR, or document uploads are introduced.

---

## 2. Dependencies

Phase 02 requires Phase 01 to be complete.

Required Phase 01 outputs:

- Supabase Auth working
- Google OAuth working
- Email/password auth working
- User profiles working
- RBAC working
- Protected routes working
- RLS working
- Active/suspended/disabled account status working
- `user` and `admin` roles available

---

## 3. Scope

### Included

- Accounts
- Account types
- Opening balances
- Current balance calculation
- Categories
- Manual income
- Manual expenses
- Transfers
- Refunds
- Adjustments
- Transaction history
- Transaction filters
- Transaction notes
- Transaction tags foundation
- Currency code storage
- Safe money handling
- Audit logs
- Soft delete/archive strategy
- Balance recalculation
- Server-side validation
- RLS for financial records
- Basic finance settings

### Out of Scope

Do not implement yet:

- Bills
- Receivables
- Expected income
- Recurring transactions
- Document uploads
- OCR
- Image processing
- Analytics dashboard
- Forecasting
- Notifications
- Premium subscriptions
- AI assistant
- Bank API integrations
- Automatic reconciliation

---

## 4. Core Architecture

Use the following flow:

```text
UI
↓
Server Action / API
↓
Financial Service
↓
Repository / Database Layer
↓
PostgreSQL
```

Do not allow UI components to directly manipulate balance-sensitive records without going through controlled business logic.

---

## 5. Financial Integrity Principles

The following rules are mandatory:

1. Transactions are the primary source of truth.
2. Account balances must be derivable from transaction history.
3. Transfers must never count as income or expense.
4. Monetary values must not use unsafe floating-point arithmetic.
5. User financial records must always be scoped by `user_id`.
6. Important financial records should be archived rather than casually deleted.
7. Balance-affecting operations must be atomic.
8. Audit history must record significant changes.
9. Client-side calculations must not be treated as authoritative.
10. Validation must run server-side.

---

## 6. Currency Strategy

Default:

```text
PHP
```

Every account and transaction should still store:

```text
currency_code
```

Use ISO-style currency codes such as:

```text
PHP
USD
EUR
JPY
```

Phase 02 does not need currency conversion.

Transfers between different currencies are out of scope for this phase unless explicitly handled later.

---

## 7. Monetary Storage

Recommended PostgreSQL type:

```text
NUMERIC(18,2)
```

or another precision suitable for expected usage.

Do not use:

```text
float
double precision
```

for authoritative money values.

In TypeScript, avoid direct arithmetic on arbitrary floating-point values when calculating authoritative balances.

Use one of these approaches:

- Decimal library
- String-to-decimal handling at service layer
- Database-side arithmetic

The implementation should document the selected approach.

---

## 8. Account Types

Initial account types:

```text
cash
bank
gcash
maya
paypal
credit_card
loan
investment
other
```

These may later evolve into normalized account-type tables if needed.

For Phase 02, a constrained text/enum approach is acceptable.

---

## 9. Account Direction

Each account should have a financial nature:

```text
asset
liability
```

Examples:

```text
Cash         → asset
Bank         → asset
GCash        → asset
Maya         → asset
PayPal       → asset
Investment   → asset
Credit Card  → liability
Loan         → liability
```

`other` should require an explicit nature.

This will help later with:

- Net worth
- Debt tracking
- Forecasting
- Financial position

---

## 10. Accounts Table

Suggested schema:

```text
accounts

id
user_id
name
type
nature
currency_code
opening_balance
current_balance
institution_name
is_active
is_archived
created_at
updated_at
```

### Notes

`current_balance` may be stored as a cached value for speed.

Transactions remain the source of truth.

The system must be able to recalculate `current_balance`.

---

## 11. Opening Balance

When a user creates an account, they may provide:

```text
opening_balance
```

### The Opening-Balance Transaction Is Authoritative

Creating an account with an opening balance creates a transaction:

```text
Account created
↓
opening_balance transaction
type = opening_balance
destination_account_id = the new account
amount = the opening amount
direction = increase (or decrease if opening overdrawn)
```

`accounts.opening_balance` is retained as an **input-only** record of what the
user typed. It is displayed on the account detail page and kept for audit.

```text
accounts.opening_balance is NEVER summed into a balance.
```

If both the column and the transaction were summed, every account would be
wrong by exactly its opening amount from the first day — and wrong in a way
that reconciles against nothing, because both sources look authoritative.

The recalculation function in §36 reads transactions only. That is the whole
point of having it.

---

## 12. Categories

Create default categories.

Suggested table:

```text
categories

id
user_id nullable
name
type
icon
is_system
is_active
created_at
updated_at
```

Possible category types:

```text
income
expense
both
```

System categories may use:

```text
user_id = null
is_system = true
```

User-created categories use:

```text
user_id = current user
is_system = false
```

---

## 13. Default Expense Categories

Seed:

```text
Food
Transportation
Housing
Utilities
Loans
Education
Health
Shopping
Entertainment
Subscriptions
Fitness
Car
Business
Technology
Travel
Other
```

---

## 14. Default Income Categories

Suggested initial set:

```text
Salary
Freelance
Business Income
Allowance
Refund
Interest
Investment Income
Other Income
```

---

## 15. Category Rules

Users may:

- Use system categories
- Create custom categories
- Rename their custom categories
- Archive custom categories

Users must not:

- Modify system category ownership
- Convert another user's category
- Delete categories currently referenced without safe handling

Prefer archive over destructive delete.

---

## 16. Transaction Types

Initial values:

```text
income
expense
transfer
refund
adjustment
opening_balance
```

Keep internal transaction type separate from display category.

---

## 17. Transactions Table

Suggested schema:

```text
transactions

id
user_id
type
direction
amount
currency_code
transaction_date
source_account_id
destination_account_id
category_id
merchant_name
description
notes
status
is_archived
created_at
updated_at
```

### `direction`

Required for `adjustment`, optional for `opening_balance`, null for every
other type.

```text
increase
decrease
```

It is relative to the account's own displayed balance: `increase` means more
owned on an asset, more owed on a liability.

Without it an adjustment cannot say which way it moved the balance, because
§73 constrains `amount > 0` and no other column carries a sign. §48's
adjustment form already collects this value; the column is where it lands.

Possible additional fields:

```text
refund_of_transaction_id
transfer_group_id
created_by
updated_by
```

`refund_of_transaction_id` is recommended — §27 and `PHASE-06` §14 both need
to trace a refund back to its purchase.

---

## 18. Transaction Status

Suggested values:

```text
confirmed
voided
```

Do not introduce OCR review statuses yet.

OCR review belongs to Phase 05.

Manual transactions created in Phase 02 should generally be confirmed immediately after validation.

---

## 19. Income

Income represents money received into an asset account.

Example:

```text
Salary
₱30,000
→ BPI
```

Required fields:

- Amount
- Date
- Destination account
- Category
- Optional description
- Optional notes

Effect:

```text
Asset account balance increases
```

---

## 20. Expense

Expense represents money leaving an asset account or increasing a liability in a properly modeled future flow.

For Phase 02, keep the primary expense flow simple:

```text
Expense
₱1,500
from GCash
```

Required fields:

- Amount
- Date
- Source account
- Category
- Optional merchant
- Optional description
- Optional notes

Effect:

```text
Asset account balance decreases
```

### Credit-Card Purchases Are In Scope

Not optional. `credit_card` is a seeded account type with liability nature
(§41), §75's testing checklist requires three card behaviours to pass, and
both `PHASE-03` §14 and `PHASE-06` §12 build on it. A phase cannot complete
while its own acceptance tests exercise a feature its scope calls optional.

```text
Expense charged to Credit Card
→ liability balance increases
```

The purchase is the expense. The later payment is a transfer, not a second
expense. See the balance-effect matrix in §34.

---

## 21. Liability Account Behavior

For liability accounts:

```text
Positive liability balance = amount owed
```

Example:

```text
Credit Card
₱8,000
```

means:

```text
User owes ₱8,000
```

Do not represent debt with confusing negative values unless the entire system adopts that convention consistently.

Preferred user-facing model:

```text
Assets: positive amounts owned
Liabilities: positive amounts owed
```

The accounting logic must account for account nature.

---

## 22. Transfer

Transfer moves money between accounts.

Example:

```text
BPI → GCash
₱5,000
```

Must be atomic.

Possible implementation models:

### Model A — Single Transaction Record

```text
type = transfer
source_account_id
destination_account_id
amount
```

### Model B — Linked Ledger Entries

```text
transfer parent
↓
source debit entry
destination credit entry
```

For HelloPera Phase 02, Model A is acceptable if balance calculations remain reliable.

The implementation should choose one model and document it clearly.

---

## 23. Transfer Rules

A transfer must:

- Have source account
- Have destination account
- Have amount > 0
- Use different source and destination accounts
- Belong to the authenticated user
- Not count as income
- Not count as expense
- Update both affected account balances atomically

---

## 24. Asset-to-Asset Transfer

Example:

```text
BPI → GCash
₱5,000
```

Effect:

```text
BPI     decreases by ₱5,000
GCash   increases by ₱5,000
```

Net worth effect:

```text
₱0
```

---

## 25. Asset-to-Liability Transfer

Example:

```text
BPI → Credit Card
₱5,000
```

Interpretation:

```text
Credit card payment
```

Effect:

```text
BPI decreases by ₱5,000
Credit Card liability decreases by ₱5,000
```

This does not count as a new expense — the expense occurred when the card
purchase was recorded. Counting it again would double every card purchase in
every spending report.

This rule is mandatory in Phase 02.

---

## 26. Loan Payment

If a loan account exists:

```text
Bank → Loan
```

should reduce:

```text
Bank asset
Loan liability
```

Principal/interest splitting is out of scope for Phase 02 unless explicitly modeled.

For Phase 02, the transaction may be treated as debt payment without detailed amortization.

---

## 27. Refund

Refund represents reversal or return of a prior expense.

Preferred design:

```text
refund_of_transaction_id
```

Example:

```text
Original Expense
₱1,200 Shopping

Refund
₱1,200
```

Effect:

```text
Asset account increases
```

Analytics should later be able to distinguish refunds from normal income.

Refunds should not inflate ordinary income.

---

## 28. Adjustment

Adjustment exists for correcting account state without pretending the event was income or expense.

Examples:

- Initial balance correction
- Reconciliation difference
- Manual correction

Required:

- Amount
- Account
- Direction
- Reason
- Date

Adjustments must be clearly identifiable in history.

---

## 29. Tags

Phase 02 should include tag foundation.

Suggested tables:

```text
tags

id
user_id
name
created_at
```

```text
transaction_tags

transaction_id
tag_id
```

Tags are optional.

Example:

```text
work
capstone
family
travel
server
```

---

## 30. Audit Logs

Create:

```text
audit_logs
```

Suggested schema:

```text
id
actor_user_id
target_user_id
entity_type
entity_id
event_type
before_data jsonb
after_data jsonb
metadata jsonb
created_at
```

Possible events:

```text
account_created
account_updated
account_archived

transaction_created
transaction_updated
transaction_voided

category_created
category_updated
category_archived
```

---

## 31. Audit Rules

Audit records should be append-only.

Users must not directly update or delete audit logs.

Avoid storing secrets.

Audit history should preserve enough information to explain significant balance changes.

---

## 32. Soft Delete Strategy

Do not hard-delete important financial records through normal UI.

Prefer:

```text
is_archived = true
```

or:

```text
status = voided
```

For transactions:

Prefer `voided` over physical deletion.

A voided transaction must stop affecting balances.

Its history remains visible in audit logs.

---

## 33. Transaction Editing

Users may edit permitted transaction fields.

Examples:

- Date
- Category
- Merchant
- Description
- Notes
- Amount
- Account

If a balance-affecting field changes:

```text
amount
source account
destination account
type
```

the update must:

1. Reverse old balance effect.
2. Apply new balance effect.
3. Execute atomically.
4. Write audit log.

Do not simply overwrite the row and hope cached balances remain correct.

---

## 34. Balance Calculation

Authoritative account balance is derived from:

```text
sum of every confirmed, non-voided transaction
touching the account,
including its opening_balance transaction
```

Nothing else. `accounts.opening_balance` is **not** part of this sum — see
§11.

### Sign Convention

Both natures use positive numbers for their own meaning:

```text
Asset      positive = amount owned
Liability  positive = amount owed
```

So `increase` always means "more of what this account represents": more money
in a bank account, more debt on a credit card.

Net position is `total assets − total liabilities` (§60).

### Balance-Effect Matrix

Every balance change in HelloPera is one of these. There are no other cases.

| Type | Source account | Destination account | Source effect | Destination effect |
|---|---|---|---|---|
| `opening_balance` | — | the account | — | `+amount` (or `−amount` if `direction = decrease`) |
| `income` | — | asset (required) | — | `+amount` |
| `expense` | asset | — | `−amount` | — |
| `expense` | liability | — | `+amount` | — |
| `transfer` | asset | asset | `−amount` | `+amount` |
| `transfer` | asset | liability | `−amount` | `−amount` |
| `transfer` | liability | asset | `+amount` | `+amount` |
| `refund` | — | asset | — | `+amount` |
| `refund` | — | liability | — | `−amount` |
| `adjustment` | the account | — | `±amount` per `direction` | — |

`amount` is always positive (§73). The sign lives in this table, never in the
stored value.

### Reading the Non-Obvious Rows

**`expense` from a liability — a credit-card purchase.**
Buying ₱2,000 of groceries on a credit card increases what you owe. The card
balance goes *up* by ₱2,000, and this is the moment the expense occurs. See
§20.

**`transfer` asset → liability — paying a card or loan.**
Paying ₱5,000 from BPI to the credit card reduces both: BPI has ₱5,000 less,
and you owe ₱5,000 less. This is **not** a new expense — the expense happened
at purchase. Counting it again would double every card purchase, which is why
§25 and `PHASE-03` §14 insist on this shape.

**`transfer` liability → asset — a cash advance.**
Withdrawing ₱3,000 cash against a card increases the debt and increases cash.
Not income.

**`refund` to a liability.**
Returning something bought on the card credits the card, reducing what you
owe.

### Analytics Classification

Separate from balance effect, and equally binding (`PHASE-06` §11–14):

```text
income            counts as income
expense           counts as expense
refund            reduces expense; never counts as income
transfer          neither
adjustment        neither
opening_balance   neither
```

A refund is money returning from a purchase, not money earned. Treating it as
income overstates earnings in every period it lands in.

---

## 34a. Required Accounts by Type

Validation must enforce which account fields each type requires:

| Type | `source_account_id` | `destination_account_id` | `direction` |
|---|---|---|---|
| `opening_balance` | — | required | optional, default `increase` |
| `income` | — | required, must be asset | — |
| `expense` | required | — | — |
| `transfer` | required | required, must differ | — |
| `refund` | — | required | — |
| `adjustment` | required | — | **required** |

Income into a liability account is rejected — it has no coherent meaning.
Record it as a `transfer` or an `adjustment` instead.

---

## 35. Cached Balance

`accounts.current_balance` may be stored for speed.

Rules:

- Update through trusted service only.
- Never trust a client-supplied current balance.
- Provide a recalculation function.
- Periodically verify consistency where practical.

---

## 36. Balance Recalculation

Create a service/function such as:

```text
recalculateAccountBalance(accountId)
```

Use cases:

- Data integrity checks
- Repair
- Migration
- Debugging
- Admin operations later

The function should derive the balance from authoritative records.

---

## 37. Atomic Operations

Balance-sensitive writes must use transactions where possible.

Examples:

- Transfer
- Edit transfer
- Void transaction
- Account opening balance
- Refund
- Liability payment

Either all required changes succeed or none should persist.

---

## 38. Server-Side Services

Suggested services:

```text
services/
  account.service.ts
  category.service.ts
  transaction.service.ts
  balance.service.ts
  audit.service.ts
  tag.service.ts
```

Do not put core balance logic directly inside React components.

---

## 39. Data Access

No separate repository layer.

Services own both the business logic and their Supabase queries. At this
scale a repository layer adds a file to open for every change without
removing a decision from anywhere — and a layer that is used inconsistently
is worse than no layer.

The requirement that matters is unchanged: **no balance logic in React
components.** Services are the boundary.

If a query is reused across three or more services, extract it to a shared
query module at that point — driven by actual duplication, not anticipated
duplication.

Remove `repositories/` from the Phase 00 directory structure.

---

## 39a. Test Harness

Phase 02 introduces automated testing. This is the first code in HelloPera
where a silent regression costs a user money, and the balance engine is pure
logic — the easiest thing in the system to test and the most expensive thing
to get wrong.

Every phase so far has shipped a manual checkbox list. Those are useful for
integration and deployment checks, but they will not catch a sign flip
introduced six phases later. `PHASE-14` §11 requires a `test` command in the
pre-deployment gate; this is where it gets something to run.

### Required Coverage

The balance-effect matrix (§34) is a table, which makes it directly
table-testable. Cover every row:

```text
opening_balance on asset and liability
income to asset
expense from asset
expense from liability          (card purchase raises debt)
transfer asset → asset
transfer asset → liability      (card payment lowers both)
transfer liability → asset      (cash advance)
refund to asset
refund to liability
adjustment increase and decrease on both natures
```

Then the operations that combine them:

```text
edit an amount            → old effect reversed, new applied, net correct
edit the account          → old account restored, new account updated
void a transaction        → balance returns to its pre-transaction value
void a transfer           → both accounts restored, atomically
recalculate               → derived balance equals cached balance
opening_balance           → accounts.opening_balance is not double-counted
income to a liability     → rejected
same-account transfer     → rejected
adjustment without direction → rejected
```

And the classification rules, since `PHASE-06` depends on them:

```text
transfers excluded from income and expense totals
refunds excluded from income
refunds netted within expenses
voided transactions excluded from every total
```

### Shape

Unit-test the balance engine with no database — pure functions over a
transaction list. Integration-test the atomic paths (transfer, edit, void)
against a real Postgres, because atomicity is exactly what a mocked database
will not tell you about.

Add `npm run test` and `npm run typecheck` to package scripts.

### Fixtures

Development fixtures stay clearly separate from seed data (§70). Never seed
fake transactions into production.

---

## 40. Validation Schemas

Suggested:

```text
schemas/
  account.schema.ts
  category.schema.ts
  transaction.schema.ts
  transfer.schema.ts
  adjustment.schema.ts
```

Validate both:

```text
client side for UX
server side for authority
```

---

## 41. Account Validation

Validate:

```text
name required
valid type
valid nature
valid currency
opening balance valid decimal
ownership
```

For:

```text
credit_card
loan
```

default nature should be:

```text
liability
```

For:

```text
cash
bank
gcash
maya
paypal
investment
```

default nature should be:

```text
asset
```

---

## 42. Transaction Validation

Validate:

```text
amount > 0
valid date
valid currency
valid transaction type
valid account ownership
valid category ownership/access
required source/destination based on type
```

Do not trust hidden client fields for:

```text
user_id
balance
role
```

---

## 43. Future-Date Transactions

Decide Phase 02 behavior.

Recommended:

Allow future-dated manual transactions only if clearly labeled.

But future expected events belong more naturally to later phases.

Simpler Phase 02 rule:

```text
manual confirmed transactions may not be future-dated
```

unless a concrete use case requires it.

Expected future money belongs to Phase 03/07.

---

## 44. Timezone

Default user-facing timezone:

```text
Asia/Manila
```

Store timestamps as:

```text
timestamptz
```

Store transaction dates in a way that preserves the user's intended local date.

Be careful around UTC conversion.

---

## 45. Account Management UI

Routes:

```text
/accounts
/accounts/new
/accounts/[id]
/accounts/[id]/edit
```

Possible mobile flow:

```text
Accounts
↓
Add Account
↓
Type
↓
Name
↓
Opening Balance
↓
Currency
↓
Save
```

---

## 46. Transaction Routes

Suggested:

```text
/transactions
/transactions/new
/transactions/[id]
/transactions/[id]/edit
```

Optional type-focused shortcuts:

```text
/transactions/new?type=expense
/transactions/new?type=income
/transactions/new?type=transfer
```

---

## 47. Quick Entry

Provide mobile-friendly quick actions:

```text
+ Expense
+ Income
+ Transfer
```

Later the Capture button will be added for OCR.

Do not make users navigate through many screens for common actions.

---

## 48. Transaction Form

Dynamic based on type.

### Expense

```text
Amount
From Account
Category
Date
Merchant
Description
Notes
Tags
```

### Income

```text
Amount
To Account
Category
Date
Source/Description
Notes
Tags
```

### Transfer

```text
Amount
From Account
To Account
Date
Notes
```

### Refund

```text
Original Transaction
Amount
Destination Account
Date
Notes
```

### Adjustment

```text
Account
Amount
Direction
Reason
Date
```

---

## 49. Transaction History

List should show:

- Date
- Type icon
- Description / merchant
- Category
- Account
- Amount
- Status

Use clear sign/color semantics.

Example:

```text
Income
+₱30,000

Expense
-₱1,200

Transfer
₱5,000
```

Do not represent transfer as positive or negative net financial performance.

---

## 50. Filters

Phase 02 filters:

```text
date range
transaction type
account
category
amount range optional
search text
```

Sorting:

```text
newest
oldest
highest amount
lowest amount
```

---

## 51. Search

Basic search may match:

```text
merchant
description
notes
category name
```

Advanced full-text search is not required yet.

---

## 52. Account Detail Page

Should show:

- Account name
- Type
- Nature
- Current balance
- Currency
- Recent transactions
- Edit
- Archive

Later:

- Charts
- Reconciliation
- Statements
- Documents

---

## 53. Account Archival

Users should not casually delete accounts that have transactions.

Preferred behavior:

```text
archive account
```

Archived account:

- Hidden from default active account selectors
- Historical transactions remain valid
- Balance history remains available

Reactivation may be allowed.

---

## 54. Insufficient Balance

Decide whether asset accounts may go negative.

Recommended Phase 02 approach:

Allow negative balance with a visible warning rather than blocking all transactions.

Reason:

- Users may record data late
- Cash/account data may not yet be perfectly reconciled
- Some accounts can legitimately overdraft

Do not silently prevent real historical entry.

Show warning:

```text
This transaction will make the account balance negative.
```

---

## 55. Liability Overpayment

If a debt payment would reduce a liability below zero:

Recommended:

Warn the user.

Allow only if the account genuinely supports a credit balance.

For standard loan accounts, block overpayment unless explicitly allowed.

For credit cards, a credit balance may be possible.

Keep the behavior configurable by account type.

---

## 56. RLS Requirements

Enable RLS on:

```text
accounts
categories
transactions
tags
transaction_tags
audit_logs
```

### Policy Shape

Per the write-path rule (master plan §33), every one of these tables gets the
same treatment:

```text
SELECT   where user_id = (select auth.uid())
INSERT   no policy for the browser role
UPDATE   no policy for the browser role
DELETE   no policy for the browser role
```

All writes go through server actions that resolve the current user
server-side and write with the service role.

### Why Not "Restricted If Possible"

An earlier draft allowed users to "INSERT own through trusted flow" and said
balance-sensitive updates "should be restricted if possible". Neither is
enforceable. The browser holds the anon key and can reach PostgREST directly;
the database cannot tell your service layer from devtools.

With client writes enabled, protecting `current_balance`, `status` and
`user_id` requires column-level policies plus triggers on every table, and
every new column is a new chance to miss one. With writes routed through
services, a field the client never sends is a field the client cannot set.

### Fields the Client Must Never Control

```text
user_id
current_balance
status
is_archived
created_by / updated_by
```

None of these appear in any request schema. Ownership comes from the session.

### Audit Logs

```text
SELECT   own rows, if product design allows
INSERT   services only
UPDATE   never — by anyone
DELETE   never — by anyone
```

Audit history is append-only. There is no code path that rewrites it.

### Test It

§75's RLS checklist must attempt each of these with the anon key and confirm
the database refuses:

```text
INSERT a transaction directly
UPDATE accounts.current_balance directly
INSERT an audit_logs row directly
SELECT another user's account
```

A test that only confirms the UI hides the control proves nothing.

---

## 57. Service Role Usage

If any operation requires Supabase service-role privileges:

- Keep service-role key server-only.
- Never expose it to the browser.
- Use it only where necessary.
- Still validate authenticated user and authorization.

Do not bypass RLS casually.

---

## 58. Admin Access

Phase 02 admin should not automatically gain access to every user's transaction history.

Admin financial access remains restricted unless explicitly required later.

Admin may see operational counts later, but not private finance detail by default.

---

## 59. Dashboard Impact

Phase 02 should update the existing dashboard shell enough to show simple real data:

```text
Total Asset Balance
Total Liability Balance
Net Position
Recent Transactions
```

Full analytics remain Phase 06.

Do not overbuild dashboard charts here.

---

## 60. Net Position

Basic formula:

```text
Net Position
=
Total Assets
-
Total Liabilities
```

This is useful even before advanced analytics.

Display clearly.

---

## 61. Multi-Currency Constraint

HelloPera never converts currencies — this is a settled product decision, not
a Phase 02 limitation (master plan §11). Therefore:

If the user has multiple currencies:

Do not sum them into a single misleading total.

Example:

```text
PHP Assets
₱50,000

USD Assets
$500
```

Always calculate net position per currency, and label each total with its
currency. There is no combined figure to fall back to.

---

## 62. PWA Considerations

Phase 02 should remain online-first.

Do not allow offline transaction writes yet.

The PWA shell may cache static interface assets.

Sensitive financial API responses should not be indiscriminately cached.

---

## 63. Error Handling

User-facing examples:

```text
Unable to save transaction.
This account no longer exists.
Invalid transfer destination.
You cannot transfer to the same account.
Unable to update balance.
This category is unavailable.
```

Financial write failures should never leave half-completed balance updates.

---

## 64. Concurrency

Consider two transactions being created quickly.

Cached balances must remain consistent.

Prefer:

- Database transaction
- Atomic update
- Database function/RPC where appropriate
- Recalculation safety net

Avoid:

```text
read balance in browser
modify
write balance back
```

---

## 65. Idempotency

For manual transactions, accidental double-submit protection should exist.

Possible approaches:

- Disable submit while request is processing
- Request idempotency key
- Server-generated operation ID

At minimum prevent common double-click duplicates.

More advanced idempotency becomes essential in OCR and billing phases.

---

## 66. Audit Metadata

For transaction updates, audit:

```text
before
after
reason optional
actor
timestamp
```

For voiding:

```text
void_reason
```

may be useful.

---

## 67. Transaction Detail Page

Show:

```text
Type
Amount
Currency
Date
Account(s)
Category
Merchant
Description
Notes
Tags
Status
Created at
Updated at
```

Actions:

```text
Edit
Void
```

Do not show hard delete as the primary action.

---

## 68. Accessibility

Financial forms must support:

- Proper labels
- Keyboard navigation
- Error summaries
- Focus management
- Screen-reader-friendly amount labels
- Status not conveyed by color alone

---

## 69. UI Color Semantics

Use HelloPera Jade design system.

Suggested semantic usage:

```text
Income      → Success/Jade
Expense     → Danger/Muted Coral
Transfer    → Gold/Neutral
Adjustment  → Warning
Archived    → Muted
Liability   → Deep Ink/Warning context
```

Do not use color as the only status indicator.

---

## 70. Seed Data

Seed:

- System expense categories
- System income categories

Do not seed fake financial transactions in production.

Development fixtures should remain clearly separated.

---

## 71. Migration Requirements

Create migration files for:

```text
accounts
categories
transactions          (including direction)
tags
transaction_tags
audit_logs            (full shape — see PHASE-01 §40)
constraints           (including the §34a account-requirement checks)
indexes
RLS                   (SELECT-only for the browser role)
policies
seed categories
```

All schema changes must be migration-driven.

Do not rely on undocumented manual changes in Supabase dashboard.

Update `DATA-MODEL.md` in the same commit as the migration. A schema spread
across ten phase documents drifts; a consolidated one only drifts if someone
skips this step.

---

## 72. Suggested Indexes

Consider indexes on:

```text
accounts(user_id)
transactions(user_id)
transactions(transaction_date)
transactions(source_account_id)
transactions(destination_account_id)
transactions(category_id)
transactions(type)
transactions(status)
categories(user_id)
tags(user_id)
audit_logs(actor_user_id)
audit_logs(entity_type, entity_id)
```

Avoid premature excessive indexing.

---

## 73. Data Constraints

Examples:

```text
amount > 0
currency_code length = 3
source_account_id != destination_account_id
valid account nature
valid transaction type
valid transaction status
valid direction (increase | decrease | null)
direction NOT NULL when type = 'adjustment'
destination_account_id NOT NULL when type in (income, refund, opening_balance)
source_account_id NOT NULL when type in (expense, adjustment)
both accounts NOT NULL when type = 'transfer'
```

The last four encode §34a at the database level, so an invalid row cannot be
written even by a service with a bug.

Use database constraints where practical.

---

## 74. Security Requirements

Mandatory:

- Authenticated user required
- Active account status required
- Server validation
- RLS
- Ownership checks
- No client-controlled user_id
- No client-controlled balance
- No client-controlled role
- Service-role key never exposed
- Audit sensitive operations
- Financial writes atomic

---

## 75. Testing Checklist

### Accounts

- [ ] Create cash account
- [ ] Create bank account
- [ ] Create GCash account
- [ ] Create credit-card account
- [ ] Create loan account
- [ ] Opening balance handled correctly
- [ ] Archive account works
- [ ] Archived account history remains
- [ ] User A cannot access User B account

### Categories

- [ ] System categories visible
- [ ] Custom category can be created
- [ ] Custom category can be archived
- [ ] User cannot modify another user's category
- [ ] System category cannot be improperly overwritten

### Income

- [ ] Income increases asset account
- [ ] Income appears in history
- [ ] Income category saved
- [ ] Audit log created

### Expense

- [ ] Expense reduces asset account
- [ ] Negative balance warning works
- [ ] Expense appears in history
- [ ] Audit log created

### Transfer

- [ ] Asset-to-asset transfer works
- [ ] Source decreases
- [ ] Destination increases
- [ ] Transfer does not count as income
- [ ] Transfer does not count as expense
- [ ] Same-account transfer rejected
- [ ] Transfer update remains atomic
- [ ] Transfer void remains atomic

### Liability

- [ ] Credit-card balance behaves as amount owed
- [ ] Loan balance behaves as amount owed
- [ ] Asset-to-liability payment reduces debt
- [ ] Debt payment does not create duplicate expense

### Refund

- [ ] Refund links to original transaction
- [ ] Refund increases destination balance
- [ ] Refund does not inflate normal income

### Adjustment

- [ ] Adjustment changes balance correctly
- [ ] Adjustment reason required
- [ ] Adjustment is clearly labeled

### Editing

- [ ] Edit non-balance field works
- [ ] Edit amount recalculates balance
- [ ] Edit account reverses old effect and applies new effect
- [ ] Audit before/after recorded

### Voiding

- [ ] Voided transaction stops affecting balance
- [ ] Transaction history preserved
- [ ] Audit history preserved

### Balance

- [ ] Cached balance matches derived balance
- [ ] Recalculation function works
- [ ] Multiple rapid transactions remain consistent
- [ ] Every row of the §34 balance-effect matrix has an automated test
- [ ] `accounts.opening_balance` is not summed into the derived balance
- [ ] Opening-balance transaction alone reproduces the opening amount
- [ ] Income into a liability account is rejected
- [ ] Adjustment without `direction` is rejected

### Currency

- [ ] PHP default works
- [ ] Currency stored on account
- [ ] Currency stored on transaction
- [ ] Mixed currencies are not incorrectly summed

### RLS

- [ ] User A cannot read User B accounts
- [ ] User A cannot read User B transactions
- [ ] User A cannot update User B records
- [ ] User cannot fake audit entries
- [ ] Direct anon-key INSERT into `transactions` is refused by the database
- [ ] Direct anon-key UPDATE of `accounts.current_balance` is refused
- [ ] Direct anon-key INSERT into `audit_logs` is refused
- [ ] Direct anon-key UPDATE of `audit_logs` is refused

### Production

- [ ] Financial writes work through HelloDeploy
- [ ] No balance logic depends on browser state
- [ ] No secrets exposed
- [ ] Production migrations applied
- [ ] Seed categories present

---

## 76. Deployment Checks

Before completing Phase 02:

- [ ] Database migrations committed
- [ ] RLS enabled
- [ ] Policies reviewed
- [ ] System categories seeded
- [ ] Production build succeeds
- [ ] HelloDeploy deployment succeeds
- [ ] Manual account creation tested
- [ ] Manual expense tested
- [ ] Manual income tested
- [ ] Transfer tested
- [ ] Liability payment tested
- [ ] Balance recalculation tested
- [ ] Audit logging tested

---

## 77. Acceptance Criteria

Phase 02 is complete only when:

1. Authenticated active users can create financial accounts.
2. Users can create income transactions.
3. Users can create expense transactions.
4. Users can create transfers.
5. Transfers do not count as income or expense.
6. Users can record refunds.
7. Users can record adjustments.
8. Account balances update correctly.
9. Balance calculations respect asset/liability nature.
10. Users can view transaction history.
11. Users can filter transactions.
12. Users can create custom categories.
13. System categories work.
14. Monetary values use safe storage.
15. PHP is the default currency.
16. Mixed currencies are not falsely aggregated.
17. Transactions can be edited safely.
18. Transactions can be voided without losing history.
19. Audit logs record significant changes and cannot be rewritten.
20. Users cannot access another user's financial records.
21. Financial writes are atomic where required.
22. Cached account balances can be recalculated.
23. Every row of the balance-effect matrix (§34) behaves as specified.
24. Credit-card purchases raise the liability; card payments do not
    create a second expense.
25. The opening-balance transaction is the only source of opening amounts.
26. Direct client writes to financial tables are refused by the database.
27. The test harness runs and covers the balance engine.
28. HelloPera works as a useful manual finance tracker without OCR.

---

## 78. Definition of Done

Phase 02 is considered done when:

```text
HelloPera can securely and accurately
track a user's accounts,
income,
expenses,
transfers,
refunds,
adjustments,
categories,
and balances
with auditable financial integrity.
```

The application should then be ready to begin:

```text
Phase 03 — Bills, Receivables and Expected Income
```

Do not proceed to Phase 03 until all Phase 02 acceptance criteria pass.
