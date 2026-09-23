# Runtime performance

This document defines how HelloPera measures private-screen performance without
logging financial or personal data.

## Service timing logs

High-traffic reads emit one JSON log named `service timing` with:

- `operation`: `dashboard.load`, `analytics.load`, `analytics.rows`,
  `transactions.list`, `documents.list`, or `notifications.list`
- `status`: `ok` or `error`
- `duration_ms`: total server-side service duration
- aggregate fields such as `row_count`, `account_count`, `page`, and `has_next`
- `error_type` on failure, never the error message

Amounts, merchant names, notes, filenames, document contents, search terms,
user IDs, and filter IDs must never be added to these logs.

Use production-like logs to calculate p50 and p95 by operation. Investigate a
private-screen operation when its p95 is above 750ms for 15 minutes, or when
`analytics.rows` regularly exceeds 20,000 rows. At that row threshold, profile
a grouped SQL/RPC implementation before moving aggregation into Postgres.

## Dashboard loading

The dashboard performs seven independent reads in its first parallel wave and
one category-name read after the aggregates identify the required IDs. The
30-day projection reuses the accounts, bills, and expected-income rows from
that first wave and adds only the bounded expected-events read. It no longer
starts a second four-query forecast batch after the dashboard has loaded.

## Pagination

Transactions and notifications request `page size + 1` rows. The extra row is
used only to decide whether to show Next/Older, avoiding an exact `COUNT(*)` on
every list view.

Offset pagination remains for now because transaction filters support four
sort orders and page URLs are shareable. Move to keyset cursors when logs show
regular access beyond page 20. A cursor must include every sort key and a stable
ID tiebreaker; do not cursor only on a non-unique date or amount.

Exact counts remain only where the exact figure is the feature: the unread
badge, admin totals, deletion verification, and export completeness.

## Query plans and indexes

On 20 September 2026, the connected project contained zero accounts,
transactions, obligations, documents, and notifications. Read-only
`EXPLAIN (ANALYZE, BUFFERS)` checks completed in 0.065ms for transactions and
0.063ms for notifications. Those empty-table plans are not representative and
do not justify another index.

Existing migrations already provide user/date indexes for transactions,
documents, and notifications, plus partial indexes for confirmed transactions
and unread notifications. Before adding or changing an index:

1. Capture a slow operation and its row count from service timing logs.
2. Reproduce it on representative data.
3. Run `EXPLAIN (ANALYZE, BUFFERS)` with the same predicates and ordering.
4. Add an index only when the plan shows a costly scan, sort, or filter.
5. Re-run the plan and record the before/after execution time and buffers.

## Representative profiles

Do not claim a realistic latency baseline until a non-production dataset has
at least the following medium profile:

| Data | Medium | Large |
|---|---:|---:|
| Accounts | 8 | 20 |
| Transactions | 5,000 | 20,000 |
| Open and historical obligations | 100 | 500 |
| Documents | 500 | 2,000 |
| Notifications | 1,000 | 5,000 |

Measure dashboard, analytics, transaction page 1 and 20, documents, and
notification page 1 and 20 with warm and cold application processes. Record
p50 and p95 over at least 30 requests per route.


## Reproducible staging fixtures

The launch implementation adds `npm run test:performance:medium` and
`npm run test:performance:large`. Both require isolated staging configuration;
fixtures are removed afterward. Reports are attached to the Playwright results.
These are browser-navigation timings. Service p95 still comes from server logs.
Cold-process measurement requires a controlled staging restart; it has not been
measured locally or inferred from an empty production database.
