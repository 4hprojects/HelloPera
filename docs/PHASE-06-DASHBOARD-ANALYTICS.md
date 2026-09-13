# HelloPera — Phase 06: Dashboard and Analytics

## 1. Objective

Build the first complete financial dashboard and analytics layer for HelloPera.

At the end of this phase, an authenticated user should be able to:

- See current account balances
- See total assets and liabilities
- See net financial position
- See monthly income and expenses
- See recent transactions
- See upcoming bills
- See overdue bills
- See receivables
- See expected income
- Analyze spending by category
- Analyze spending by account
- Review monthly cash flow
- Filter analytics by date range
- Use charts and summaries on desktop and mobile
- Trust that analytics use only confirmed financial records

Phase 06 completes the first shippable HelloPera: **Gate 1, the manual
tracker** (master plan §54).

Phases 0–3 plus this one are a complete personal finance application. It is
worth putting in front of real users before building Phases 04 and 05, which
are the most expensive and technically riskiest part of the product.

---

## 2. Dependencies

Phase 06 requires **Phase 03** to be complete. It does not require Phases 04
or 05.

Required prior capabilities:

- Accounts
- Asset/liability model
- Transactions
- Bills
- Receivables
- Expected income
- Safe monetary handling
- RLS
- Audit logs
- User authentication

### Why Not Phase 05

An earlier draft listed "OCR-confirmed records" and "Document links" as
prerequisites. Neither is used. Every query in this document reads confirmed
transactions, bills, receivables and expected income — all of which exist at
the end of Phase 03.

The distinction matters: a transaction confirmed from an OCR extraction is
just a confirmed transaction. Analytics cannot tell how it was created, and
should not care.

Removing this assumed dependency is what allows Gate 1 to ship without the
document pipeline.

If Phases 04 and 05 are built first, nothing here changes. Revisit only to
surface document links on the transaction detail view, which is presentation,
not analytics.

---

## 3. Scope

### Included

- Main dashboard
- Account balance summary
- Asset summary
- Liability summary
- Net position
- Monthly income summary
- Monthly expense summary
- Net cash flow
- Recent transactions
- Upcoming bills
- Overdue bills
- Receivables summary
- Expected income summary
- Spending by category
- Spending by account
- Income by category
- Monthly trend
- Date-range filtering
- Account filtering
- Category filtering
- Transaction type filtering
- Responsive charts
- Empty states
- Analytics query layer
- Performance-conscious aggregation
- Mixed-currency safeguards

### Out of Scope

Do not implement yet:

- Forecasting
- Recurring transaction engine
- Push notifications
- AI financial assistant
- Subscription entitlements
- Premium-only analytics
- Bank syncing
- Automated budgeting
- Investment performance analytics
- Tax reports
- Full net-worth history
- Family/shared finance analytics

---

## 4. Analytics Principle

Official dashboard values must use:

```text
confirmed
non-voided
user-owned
financial records
```

Do not include:

- OCR drafts
- Discarded extractions
- Voided transactions
- Cancelled obligations where not appropriate
- Another user's data

---

## 5. Dashboard Route

Primary route:

```text
/dashboard
```

This becomes the default authenticated landing page.

---

## 6. Dashboard Layout

Recommended sections:

```text
Financial Overview
↓
Account Balances
↓
Cash Flow Summary
↓
Upcoming Bills / Receivables
↓
Recent Transactions
↓
Spending Analytics
```

Desktop may use multiple columns.

Mobile should prioritize vertical stacking.

---

## 7. Financial Overview Cards

Initial cards:

```text
Total Assets
Total Liabilities
Net Position
Monthly Net Cash Flow
```

Optional secondary cards:

```text
Income This Month
Expenses This Month
Receivables Outstanding
Bills Due Soon
```

---

## 8. Net Position

Formula:

```text
Net Position
=
Total Assets
-
Total Liabilities
```

Only aggregate accounts in the same currency.

If user has multiple currencies:

```text
PHP Net Position
USD Net Position
```

Do not convert or combine without FX data.

---

## 9. Asset Summary

Include active asset accounts.

Examples:

```text
Cash
Bank
GCash
Maya
PayPal
Investment
```

Use current balances derived/cached from Phase 02.

---

## 10. Liability Summary

Include:

```text
Credit Card
Loan
Other liability accounts
```

Display positive amount owed.

Do not display debt as confusing negative asset unless explicitly designed.

---

## 11. Monthly Income

Calculate from:

```text
transactions.type = income
status = confirmed
not voided
transaction_date within selected month
```

Exclude:

```text
transfers
refunds
adjustments
```

A refund is money returning from a purchase, not money earned. Counting it as
income overstates earnings in every period a refund lands in — and a user who
returns a ₱20,000 laptop should not appear to have earned ₱20,000.

Refunds are handled inside the expense figure instead — see §12 and §14.

---

## 12. Monthly Expenses

Calculate from:

```text
transactions.type = expense
status = confirmed
not voided
transaction_date within selected month
```

Exclude:

```text
transfers
adjustments
```

Refunds are **not** excluded here — they are netted against expenses. See
§14 for the exact rule.

Credit-card bill payment does not duplicate purchase expenses: the expense
occurred at purchase, and the payment is a transfer (`PHASE-02` §34).

---

## 13. Net Cash Flow

Formula:

```text
Net Cash Flow
=
Income
-
Net Expenses
```

`Net Expenses` is gross expenses less refunds (§14).

For Phase 06, this is transaction-based realized cash flow.

Do not include expected income or unpaid bills in actual cash flow.

---

## 14. Refund Handling — Settled Rule

One rule, applied everywhere:

```text
Refunds are excluded from income.
Refunds are netted within expenses.
Both figures are shown.
```

Presentation:

```text
Gross Expenses    ₱24,500
Refunds          −₱ 1,200
Net Expenses      ₱23,300
```

`Net Expenses` is the figure that feeds net cash flow (§13), because it is
what actually left the user's accounts.

`Gross Expenses` stays visible so a large refund cannot silently hide a large
purchase — a month with a ₱20,000 purchase and a ₱20,000 return is not the
same as a month with no activity, and the user should be able to see that.

Do not classify refunds as ordinary income, and do not drop them from
expenses entirely — an earlier draft did both at once, which left the net
line with nothing to net.

Category and account breakdowns (§21, §22) use net figures, with the refund
attributed to the category and account of the original purchase where
`refund_of_transaction_id` is set.

---

## 15. Adjustments

Adjustments should not automatically appear as income or expense.

Possible dashboard display:

```text
Balance Adjustments
```

separately if needed.

---

## 16. Recent Transactions

Show latest confirmed transactions.

Recommended fields:

```text
Date
Type
Description/Merchant
Category
Account
Amount
```

Limit initial list:

```text
5–10 items
```

Link to:

```text
/transactions
```

---

## 17. Upcoming Bills

Show open bills due soon.

Recommended:

```text
Provider
Amount Remaining
Due Date
Days Remaining
Status
```

Configurable due-soon window from Phase 03.

---

## 18. Overdue Bills

Show prominently when:

```text
remaining > 0
due_date < today
not cancelled
```

Do not overuse alarming styling.

---

## 19. Receivables Summary

Show:

```text
Outstanding Amount
Overdue Amount
Due Soon
```

Possible list:

```text
Party
Remaining
Due Date
Status
```

---

## 20. Expected Income Summary

Show:

```text
Expected This Month
Upcoming
Missed
```

Do not include expected income in realized income totals.

---

## 21. Spending by Category

Aggregate:

```text
confirmed expense transactions
group by category
```

Possible display:

```text
Food              ₱8,200
Utilities         ₱4,500
Transportation    ₱3,200
```

Chart options:

- Donut
- Horizontal bar

Prefer readability over decorative charts.

---

## 22. Spending by Account

Aggregate expenses by source account.

Example:

```text
GCash
₱8,500

BPI
₱6,200

Cash
₱3,400
```

---

## 23. Income by Category

Aggregate income by category.

Example:

```text
Salary
Freelance
Business Income
```

Useful for users with multiple income sources.

---

## 24. Monthly Trend

Show month-by-month:

```text
Income
Expenses
Net Cash Flow
```

Suggested initial window:

```text
6 months
```

Allow:

```text
3 months
6 months
12 months
```

if performance remains acceptable.

---

## 25. Date Filters

Support:

```text
This Month
Last Month
Last 3 Months
Last 6 Months
This Year
Custom Range
```

Custom range should validate:

```text
start <= end
```

---

## 26. Account Filter

Allow analytics filtering by account.

Example:

```text
All Accounts
GCash
BPI
Cash
```

Do not include archived accounts by default unless historical data requires them.

---

## 27. Category Filter

Allow:

```text
All Categories
Food
Utilities
...
```

System and user categories should both appear.

---

## 28. Transaction Type Filter

Support:

```text
All
Income
Expense
Transfer
Refund
Adjustment
```

Dashboard default analytics should focus on:

```text
Income
Expense
```

---

## 29. Currency Filter

If user has multiple currencies:

Require explicit currency selection where totals would otherwise be misleading.

Example:

```text
Currency: PHP
```

Do not convert currencies in Phase 06.

---

## 30. Analytics Query Layer

Create dedicated analytics service.

Suggested:

```text
services/
  analytics.service.ts
  dashboard.service.ts
```

Avoid embedding aggregate SQL in UI components.

---

## 31. Suggested Analytics Functions

Conceptual:

```text
getFinancialOverview()
getMonthlyCashFlow()
getSpendingByCategory()
getSpendingByAccount()
getIncomeByCategory()
getMonthlyTrend()
getUpcomingBills()
getReceivableSummary()
getExpectedIncomeSummary()
getRecentTransactions()
```

---

## 32. Database Views

Consider PostgreSQL views if they simplify queries.

Possible:

```text
confirmed_transactions_view
open_bills_view
outstanding_receivables_view
```

Use only if they improve clarity.

Do not create excessive database views prematurely.

---

## 33. Materialized Views

Not required for MVP.

Introduce only if real performance problems appear.

---

## 34. Aggregate Accuracy

Ensure totals agree with transaction history.

Tests should compare:

```text
dashboard total
=
sum of qualifying transaction rows
```

Never rely on chart data alone.

---

## 35. Timezone

Default:

```text
Asia/Manila
```

Monthly boundaries must use intended user-local date logic.

Be careful with:

```text
UTC midnight
```

and transactions near day boundaries.

---

## 36. Chart Library

Use a React chart library appropriate for Next.js.

Potential choice:

```text
Recharts
```

If used:

- Lazy-load where appropriate
- Avoid huge bundles
- Ensure responsive containers
- Provide accessible summaries

---

## 37. Chart Accessibility

Every chart should have a textual equivalent.

Example:

```text
Food: ₱8,200
Utilities: ₱4,500
Transportation: ₱3,200
```

Do not make information available only through color or hover.

---

## 38. Color Semantics

Use HelloPera Jade.

Suggested:

```text
Income      → Success/Jade
Expense     → Danger/Muted Coral
Transfer    → Gold/Neutral
Liability   → Deep Ink/Warning
Overdue     → Danger
Receivable  → Soft Jade
```

Do not hardcode chart colors throughout components.

Use design tokens.

---

## 39. Mobile Dashboard

Recommended priority:

```text
Net Position
Cash Flow
Accounts
Upcoming Bills
Receivables
Recent Transactions
Spending
```

Use horizontal scrolling sparingly.

Prefer stacked cards.

---

## 40. Desktop Dashboard

Possible layout:

```text
Overview Cards
-------------------------
Accounts | Cash Flow Chart
-------------------------
Bills    | Receivables
-------------------------
Spending by Category
-------------------------
Recent Transactions
```

Exact design may evolve.

---

## 41. Loading States

Use skeletons or compact placeholders.

Do not show:

```text
₱0
```

while data is merely loading, because it may look like a real balance.

---

## 42. Empty States

Examples:

```text
No transactions this month.
```

```text
No upcoming bills.
```

```text
No outstanding receivables.
```

Do not show empty charts.

---

## 43. Error States

Examples:

```text
We couldn't load your financial summary.
```

```text
Unable to load spending analytics.
```

Allow retry where appropriate.

---

## 44. Sensitive Data Handling

Do not expose raw financial data in public metadata.

Do not render balances server-side into public pages.

Authenticated dashboard only.

---

## 45. Caching

Be conservative.

Do not cache private user analytics globally.

Potential:

```text
per-request
private short-lived server cache
```

only if correctly scoped.

For MVP, fresh server queries are safer.

---

## 46. Data Refresh

After creating/editing/voiding a transaction:

Dashboard values should refresh.

Possible mechanisms:

- Revalidation
- Server refresh
- Query invalidation

Do not leave stale balance cards.

---

## 47. Account Balance Widget

Show:

```text
Account Name
Type
Balance
Currency
```

Optional:

```text
Last transaction date
```

Archived accounts excluded by default.

---

## 48. Net Position Trend

Out of scope for MVP if historical snapshots are not available.

Do not fake net-worth trend using current balances.

Can be added later with snapshots or historical derivation.

---

## 49. Bill Metrics

Dashboard may calculate:

```text
Due Soon Count
Due Soon Amount
Overdue Count
Overdue Amount
```

Use remaining amount, not original bill total.

---

## 50. Receivable Metrics

Calculate:

```text
Outstanding Receivables
Overdue Receivables
Collected This Month optional
```

Use remaining amounts for outstanding totals.

---

## 51. Expected Income Metrics

Calculate:

```text
Expected This Month
Received From Expected Income
Missed Expected Income
```

Keep expected and actual clearly separated.

---

## 52. Analytics Routes

Suggested:

```text
/analytics
```

Subsections or tabs:

```text
Overview
Spending
Income
Accounts
Bills
Receivables
```

For MVP, a single analytics page with sections is sufficient.

---

## 53. Dashboard vs Analytics

Dashboard:

```text
quick current overview
```

Analytics:

```text
deeper filtering and trends
```

Do not duplicate every chart in both places.

---

## 54. Transaction Analytics

Potential sections:

```text
Spending by Category
Income by Category
Spending by Account
Monthly Trend
Top Merchants optional
```

Top merchants may be included if transaction merchant field is populated enough.

---

## 55. Merchant Analytics

Optional Phase 06 feature.

Aggregate:

```text
merchant_name
```

Example:

```text
SM
Jollibee
Shopee
```

Be aware of naming inconsistency.

Do not build merchant-normalization AI yet.

---

## 56. Search Integration

Analytics may link back to filtered transaction list.

Example:

```text
Click Food
↓
/transactions?category=food&range=this-month
```

Useful for drill-down.

---

## 57. Drill-Down

Cards and charts should link to detail when helpful.

Examples:

```text
Expenses This Month
→ filtered transactions

Overdue Bills
→ bills?status=overdue

Outstanding Receivables
→ receivables?status=open
```

---

## 58. URL Filter State

Prefer storing analytics filters in query parameters where practical.

Example:

```text
/analytics?range=6m&currency=PHP
```

Benefits:

- Shareable internally
- Refresh-safe
- Browser navigation

---

## 59. Export

Out of scope for Phase 06.

Premium export belongs to monetization/premium phases.

Do not add CSV/PDF export yet unless required.

---

## 60. Analytics Security

All analytics queries must be user-scoped.

Do not accept arbitrary `user_id` from browser.

Resolve current authenticated user server-side.

---

## 61. RLS

Underlying tables remain RLS-protected, granting the browser `SELECT` on own
rows only (master plan §33). Analytics are read-only, so this phase adds no
new write paths.

If database views are used, confirm they preserve security behavior.

Do not accidentally create security-definer views that bypass ownership without explicit intent.

---

## 62. Admin Privacy

Admin dashboard should not show private user financial totals.

Operational metrics belong later.

Do not reuse user dashboard queries for admin.

---

## 63. Suggested Components

```text
components/dashboard/
  financial-overview.tsx
  account-balances.tsx
  cash-flow-summary.tsx
  upcoming-bills.tsx
  receivables-summary.tsx
  expected-income-summary.tsx
  recent-transactions.tsx

components/analytics/
  date-range-filter.tsx
  currency-filter.tsx
  category-spending-chart.tsx
  account-spending-chart.tsx
  monthly-trend-chart.tsx
  analytics-summary-card.tsx
```

---

## 64. Suggested Types

```text
types/
  dashboard.ts
  analytics.ts
```

Examples:

```text
FinancialOverview
MonthlyCashFlow
CategoryAggregate
AccountAggregate
MonthlyTrendPoint
```

---

## 65. Validation

Validate analytics inputs:

```text
date range
currency code
account id
category id
transaction type
```

Reject:

```text
end before start
invalid account ownership
invalid category
unsupported currency
```

---

## 66. Query Performance

Avoid N+1 queries.

Prefer:

- Aggregation SQL
- Joins
- Grouping
- Limited result sets

Example:

Do not fetch all transactions to browser and sum them client-side.

Aggregate server-side/database-side.

---

## 67. Pagination

Recent transactions:

```text
limit
```

Full transaction list should remain paginated.

Analytics should use aggregate queries rather than pagination.

---

## 68. Index Review

Review indexes on:

```text
transactions(user_id, transaction_date)
transactions(user_id, type)
transactions(user_id, category_id)
transactions(user_id, source_account_id)
bills(user_id, due_date)
receivables(user_id, due_date)
expected_income(user_id, expected_date)
```

Add only where query plans justify.

---

## 69. Performance Target

Reasonable MVP target:

```text
Dashboard should feel responsive with several thousand transactions per user.
```

Do not optimize for millions of rows per user yet.

---

## 70. Server Rendering

Use server-side data fetching where it improves security and initial load.

Interactive filters may use client components.

Keep confidential queries on the server.

---

## 71. PWA Considerations

Dashboard should work well when installed as PWA.

Do not cache private analytics indefinitely.

Offline dashboard can be deferred.

---

## 72. Analytics Audit

Analytics views themselves do not need audit logs.

Underlying financial data changes are already audited.

Do not log every chart view as a financial audit event.

---

## 73. Testing Checklist

### Overview

- [ ] Total assets correct
- [ ] Total liabilities correct
- [ ] Net position correct
- [ ] Mixed currencies separated
- [ ] Archived accounts handled correctly

### Income

- [ ] Monthly income correct
- [ ] Transfers excluded
- [ ] Refunds excluded from ordinary income
- [ ] Voided transactions excluded

### Expenses

- [ ] Gross monthly expenses correct
- [ ] Transfers excluded
- [ ] Refunds netted within expenses, not excluded
- [ ] Gross and net both shown and both correct
- [ ] Refund attributed to the original purchase's category and account
- [ ] Credit-card purchase counted once, at purchase
- [ ] Credit-card payment does not duplicate expense

### Cash Flow

- [ ] Net cash flow correct
- [ ] Date range works
- [ ] Month boundaries correct in Asia/Manila

### Bills

- [ ] Due-soon amount uses remaining balance
- [ ] Overdue amount correct
- [ ] Paid bills excluded
- [ ] Cancelled bills excluded

### Receivables

- [ ] Outstanding amount correct
- [ ] Partial collections reflected
- [ ] Overdue amount correct
- [ ] Paid receivables excluded

### Expected Income

- [ ] Expected amount correct
- [ ] Received expected income handled
- [ ] Missed expected income handled
- [ ] Not counted as realized income before receipt

### Category Analytics

- [ ] Spending grouped correctly
- [ ] Custom categories included
- [ ] Archived categories historical data still visible where appropriate

### Account Analytics

- [ ] Expense by account correct
- [ ] Archived account historical transactions handled
- [ ] Asset/liability display correct

### Filters

- [ ] This Month works
- [ ] Last Month works
- [ ] 3 Months works
- [ ] 6 Months works
- [ ] This Year works
- [ ] Custom range works
- [ ] Account filter works
- [ ] Category filter works
- [ ] Currency filter works

### Security

- [ ] User A cannot see User B analytics
- [ ] Query parameters cannot change user ownership
- [ ] Private totals not exposed publicly
- [ ] Admin does not automatically see user financial analytics

### UI

- [ ] Mobile dashboard usable
- [ ] Desktop dashboard usable
- [ ] Dark mode works
- [ ] Charts responsive
- [ ] Charts have textual equivalents
- [ ] Empty states work
- [ ] Loading states do not show false zero balances

### Production

- [ ] Dashboard works through HelloDeploy
- [ ] Analytics queries perform acceptably
- [ ] No private caching leak
- [ ] Direct route refresh works
- [ ] Production chart bundle loads correctly

---

## 74. Deployment Checks

Before completing Phase 06:

- [ ] Analytics service deployed
- [ ] Dashboard queries tested
- [ ] Indexes reviewed
- [ ] Production build succeeds
- [ ] HelloDeploy deployment succeeds
- [ ] Dashboard tested with realistic sample volume
- [ ] Mobile PWA dashboard tested
- [ ] Mixed-currency behavior tested
- [ ] Cross-user isolation tested
- [ ] Chart accessibility reviewed

---

## 75. Acceptance Criteria

Phase 06 is complete only when:

1. Users can view account balances.
2. Users can view total assets.
3. Users can view total liabilities.
4. Users can view net position.
5. Users can view monthly income.
6. Users can view monthly expenses.
7. Users can view net cash flow.
8. Transfers are excluded from income/expense analytics.
9. Refunds are excluded from income and netted within expenses.
10. Gross and net expenses are both visible.
11. Voided transactions are excluded.
12. Users can view recent transactions.
13. Users can view upcoming bills.
14. Users can view overdue bills.
15. Users can view outstanding receivables.
16. Users can view expected income separately from realized income.
17. Users can analyze spending by category.
18. Users can analyze spending by account.
19. Users can view monthly trends.
20. Users can filter by date range.
21. Users can filter by account/category/currency where applicable.
22. Mixed currencies are never misleadingly summed.
23. Analytics queries are user-scoped.
24. Dashboard works on mobile and desktop.
25. Charts have accessible textual equivalents.
26. Dashboard performs acceptably with realistic MVP data.
27. All official analytics use confirmed financial records only.

---

## 76. Definition of Done

Phase 06 is considered done when:

```text
HelloPera gives each user a clear,
accurate,
secure,
and responsive view of
their current finances,
cash flow,
obligations,
receivables,
and spending patterns.
```

At this point, HelloPera reaches the first complete MVP defined in the master plan.

The application should then be ready to begin:

```text
Phase 07 — Recurring Transactions and Forecasting
```

Do not proceed to Phase 07 until all Phase 06 acceptance criteria pass.
