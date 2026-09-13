# Phase 06 — implementation notes

Decisions taken while building the dashboard (pass 1) and /analytics (pass 2) that a reader of
`PHASE-06-DASHBOARD-ANALYTICS.md` would otherwise have to reverse-engineer.

---

## 1. The 1000-row cap — the bug that mattered most

Supabase caps a PostgREST read at **1000 rows** and returns **HTTP 200 with no
error**, just a `content-range: 0-999/1211` header nobody reads. Verified
against this project:

```
$ curl .../transactions?select=amount&status=eq.confirmed&transaction_date=gte.2026-09-01
content-range: 0-999/1211      ← 211 rows silently missing
```

The dashboard's analytics query is the one read in the app that legitimately
spans thousands of rows, and an unbounded `.select()` there would understate
every total on the page with nothing looking wrong. `fetchAnalyticsRows`
(`services/analytics.service.ts`) therefore pages explicitly with
`count: 'exact'`, a stable `ORDER BY (transaction_date, id)`, and **throws**
rather than returning a short read.

Verified end to end: 1,211 transactions in the window produce ₱26,000 gross
expenses — the correct figure. A single unbounded select returns ₱81,990 of
amounts from 1,000 rows.

`listObligations` now carries an explicit `.limit(1000)` for the same reason:
obligations stay far below the cap in practice, but an explicit bound turns a
silent short read into an obviously truncated list.

## 2. Aggregation is TypeScript, not SQL — and where the tripwire is

§32 says not to create views prematurely and §33 rules out materialized views
for MVP. §66's actual concern — "do not fetch all transactions to browser and
sum them client-side" — is satisfied: the browser never sees a row.

The trade buys something specific: §34's accuracy property ("dashboard total =
sum of qualifying transaction rows") is a **unit test** over pure functions in
`lib/analytics/`, which it could not be against SQL without a live database.

**Tripwire:** past roughly 20k rows in a window, move `fetchAnalyticsRows` to
a `SECURITY DEFINER` RPC returning pre-grouped totals. The pure layer takes
plain rows, so nothing above it changes.

## 3. Why nothing testable lives in `services/`

`server-only`'s entry point throws on import, so any test importing
`services/*` dies before it runs. Every figure worth asserting therefore lives
in `lib/analytics/`:

| Module | Covers |
|---|---|
| `aggregate.ts` | §11–§15, §21–§24 — cash flow, trend, breakdowns, refund attribution |
| `obligations.ts` | §19, §20, §49, §50, §51 — bill/receivable/expected metrics |
| `position.ts` | §8, §9, §10 — assets, liabilities, net position |
| `series.ts` | month windows, axis domains, `endOfMonth` |
| `format.ts` | compact money, due labels |

`summarise()` in `account.service.ts` moved here too: §75 criteria 2–4 had no
test coverage at all before.

## 4. Three rules that are easy to get wrong

**Net expenses are signed, never floored at zero.** An earlier version floored
them. That broke two things: `Σ spendingByCategory === netExpenses` no longer
held, and a month whose refunds exceeded its purchases reported
`netCashFlow = income` when money had actually come *in*. Category aggregates
keep net-negative buckets for the same reason; the donut filters to positive
slices at the view layer and prints a line saying how many were left out.

**A refund belongs to the original purchase's category and account (§14).** Not
its own. The parent is resolved in the same round-trip via a PostgREST
self-embed on `refund_of_transaction_id`, because the purchase may sit outside
the fetched window entirely — a September refund of an August purchase needs
August's category. Cross-currency parents are ignored (§8).

**The month is the whole month, not month-to-date.** §11 and §12 say "within
the selected month". A confirmed transaction dated later this month has already
moved the balance shown beside it, so excluding it would make cash flow and
balances disagree. `endOfMonth()` in `lib/analytics/series.ts`.

## 5. §68 index review — no migration needed

Reviewed against §68's list:

| §68 asks for | Status |
|---|---|
| `transactions(user_id, transaction_date)` | `transactions_confirmed_idx` — partial on `status='confirmed'`, an exact match for the analytics query |
| `transactions(user_id, type)` | `transactions_user_type_idx` |
| `transactions(user_id, category_id)` | `transactions_user_category_idx` |
| `transactions(user_id, source_account_id)` | `transactions_source_idx` (partial) |
| `bills(user_id, due_date)` | `bills_user_due_idx`, `bills_open_idx` |
| `receivables(user_id, due_date)` | `receivables_user_due_idx`, `receivables_open_idx` |
| `expected_income(user_id, expected_date)` | `expected_income_user_date_idx` |

**Pass 1 ships zero migrations** — no views (§32), no materialized views (§33),
no new indexes (§68).

## 6. Layout — reconciling §6, §39 and §40

They disagree in two places. §39 is explicitly a mobile *priority* list, so net
position and net cash flow lead the overview cards; §6's ordering governs from
there, and `lg:grid-cols-2` bands produce §40's columns. One DOM order at every
width — no `order-*` utilities — so a screen reader follows the visual order.

## 7. Removed: the net-position sparkline

`balanceTrend()` reconstructed historical net position backwards from today's
balance. §48 forbids it outright ("Do not fake net-worth trend using current
balances") and it was wrong in three independent ways: it derived from
`income − expenses`, which excludes adjustments and opening balances; it walked
from a balance that excludes archived accounts through rows that include them;
and `Sparkline` rescales min→max, so a ₱50 wobble drew like a ₱50,000 collapse.

Deleted with its tests. Sparklines remain on income, expenses and net cash
flow, where each point is a measured month rather than an inference.

## 8. Fixed in passing: mixed-currency totals

`bills/page.tsx` and `receivables/page.tsx` summed `remaining` across every
currency and stamped the profile's default on the result — so a $40 bill added
₱40 to the peso total. §8, §29 and §75 criterion 22 all forbid it. Both pages
now render one card row per currency via `components/finance/obligation-totals.tsx`.

## 9. Pass 2 — /analytics, and the defect that nearly shipped

Criteria **20** and **21** are closed by `app/(app)/analytics/page.tsx`.

### Filters are applied in memory, never in SQL

Narrowing the query by type or category **silently breaks §14**. A refund is
netted against the category, account and merchant of the purchase it reverses;
a refund row carries its *own* category, often no account, and type `refund`.
Filter the query to `type=expense` and the refunds never arrive, so every
category total comes out overstated by exactly the refunds it should have
absorbed — a wrong number that reconciles with itself and looks entirely
plausible. `lib/analytics/filter.test.ts` pins this with a characterisation
test: the naive filter gives ₱8,000 where the truth is ₱5,000.

Only `from`/`to` reach PostgREST. Everything else is `applyFilter` over
`AnalyticsRow[]`.

### Filter on the attributed key, not "own OR parent"

The first version of `applyFilter` kept a row when **either** its own key or
its parent's matched. That looks equivalent to the aggregator's rule and is
not: `groupNet` uses exactly one key, `refundOf?.X ?? row.X`. A refund that
landed in GCash but reverses a BPI purchase passed an `accountId=BPI` filter
on its own key, then got charged to GCash — so a page filtered to BPI reported
**₱0 spent** and drew a **GCash** bar on it. Measured, not theorised.

The fix is `attributedCategoryId` / `attributedAccountId` / `attributedMerchant`
in `aggregate.ts`, consumed by both `groupNet` and `applyFilter`, so filtering
and grouping ask the same question of the same row. The invariant, asserted in
`filter.test.ts`:

> `groupBy_K(applyFilter(rows, {K: v}))` equals the single bucket `v` of
> `groupBy_K(rows)`.

A chart can no longer contradict the filter above it.

### The one deliberate asymmetry

Selecting **expense** also keeps refund rows. A refund is not an expense, but
§14 makes it part of the expense figure, and a spending view that dropped the
returns would overstate what was actually spent — failing §75 criteria 9 and
10 in the very card that exists to satisfy them.

### Validation: shape falls back, meaning is reported

- **Shape** (unparseable date, non-UUID, unknown enum) → `.catch()`. A stale
  or hand-edited link must still render; §58 promises refresh-safe URLs.
- **Meaning** (§65's four "reject" cases: unowned account, unknown category,
  unheld currency, reversed range) → dropped **and named on the page**. A
  silently ignored filter renders identically to a genuinely empty period,
  and confusing "we ignored your filter" with "you spent nothing" is a bad
  mistake for a finance app to make quietly.
- `parseAnalyticsParams` also returns `dropped[]` for parameters that were
  supplied but unusable — found the hard way, when a fixture's invalid-variant
  UUID made the account filter do nothing at all with no explanation.

Account ownership cannot be checked by Zod: a UUID is well-formed whatever it
belongs to. It is checked by set membership against `listAccounts()`, which
RLS already scopes to the user. This is a UX affordance, **not** the security
boundary — `fetchAnalyticsRows` is RLS-scoped, so a forged id can only ever
produce an empty page.

### Range boundaries worth knowing

- `this-year` ends at the **end of the current month**, not 31 December:
  future months would draw as empty columns reading "you earned nothing in
  November".
- A lone `to=` means "the month ending there". Defaulting the other half to
  the current month produced an eight-month range from one typed date — and
  then swapped it.
- Custom ranges are clamped to **5 years**. `fetchAnalyticsRows` gives up past
  60,000 rows (`MAX_PAGES × PAGE`) and throws, which would land on an error
  page blaming the database for a hand-edited URL.
- `monthsInRange` caps the trend at 24 months and **reports that it did**, so
  the chart never plots a shorter period than its heading claims.

### Smaller decisions

- Category **labels** come from `resolveCategoryNames` (by id, no active
  filter), not from the `listCategories()` selector list, which filters
  `is_active = true` — a deactivated category would otherwise collapse into
  "Uncategorised" and break §73's "archived categories historical data still
  visible".
- A breakdown grouped by a dimension the filter has pinned is hidden: grouping
  by category on a page filtered to one category is a donut with a single
  100% slice.
- Selecting a **neutral** type (transfer, adjustment, opening balance) shows
  an explanation and a row count instead of a cash-flow card of ₱0s, which
  §15 says are correct and which look like a failure.
- **Merchants** (§55) group on the raw `merchant_name`, trimmed only. "SM" and
  "SM Supermarket" stay two rows — merging them would be a guess and §55 says
  not to guess. Known limitation: the grouping is case-sensitive.
- `transactions/page.tsx` pagination previously dropped every active filter on
  a page change. /analytics links into that page with filters, so it is fixed
  here.

### Still out of scope

§59 export (explicitly deferred to the premium phases) and the range-filtered
bills/receivables sections of §52 — those live on the dashboard, and §53 says
not to duplicate every chart in both places.
