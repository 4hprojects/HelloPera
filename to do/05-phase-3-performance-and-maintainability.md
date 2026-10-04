# Phase 3 — performance and maintainability

## Goal and entry requirements

Establish representative performance and trustworthy operational information while keeping the architecture understandable. Use the corrected money/read boundaries from Phase 1 and isolated staging from HP-016. Do not optimize from empty-table plans or synthetic local build duration.

## Work packages

| Task                                       | Priority | Implementation result                                          |
| ------------------------------------------ | -------- | -------------------------------------------------------------- |
| [HP-012](02-prioritized-backlog.md#hp-012) | P1       | Medium/large profile measurements and justified capacity fixes |
| [HP-013](02-prioritized-backlog.md#hp-013) | P1       | Complete admin counts and visible unavailable states           |
| [HP-014](02-prioritized-backlog.md#hp-014) | P2       | Current documentation and consistent developer workflow        |
| [HP-015](02-prioritized-backlog.md#hp-015) | P2       | Verified header/proxy assumptions and measured hardening       |
| [HP-024](02-prioritized-backlog.md#hp-024) | P2       | Broader public, SEO and PWA quality coverage                   |

## Measurement specification

Use the profiles already defined in [PERFORMANCE.md](../docs/PERFORMANCE.md):

| Data          | Medium |  Large |
| ------------- | -----: | -----: |
| Accounts      |      8 |     20 |
| Transactions  |  5,000 | 20,000 |
| Obligations   |    100 |    500 |
| Documents     |    500 |  2,000 |
| Notifications |  1,000 |  5,000 |

Measure dashboard, analytics, transaction pages 1/20, documents and notification pages 1/20. Collect at least 30 requests per route for warm and controlled cold processes. Record browser timings separately from service timings and include deployment SHA, fixture counts, resource limits, SQL plans and failure rates.

The current investigation threshold is service p95 above 750 ms for 15 minutes. The analytics row threshold is 20,000; regular deep-page use beyond page 20 is the existing trigger to evaluate keyset pagination. These are investigation triggers, not permission to truncate complete financial totals. Record justified exceptions and retest changes against the same dataset.

Add export memory/response-size and deletion duration measurements to verify fit within the documented hosting constraints. Inspect unexpected account/list row caps as data grows. Do not introduce new indexes until predicates, ordering and query plans justify them; avoid moving aggregation into a privileged RPC without reviewing RLS semantics.

## Maintainability and product quality

Retain the service layer and pure domain helpers. Reduce duplication opportunistically around changed action validation; avoid a project-wide refactor during launch hardening. Keep historical phase records intact while updating current guidance. Check private logging for values accidentally embedded in raw exception messages.

Public UI improvements should follow observed behavior: the reviewed Features screenshots fit the viewport, but header navigation wraps at phone/tablet sizes and the fixed consent banner reduces available phone space. Verify reading order, dismissal and keyboard access before changing layout. SEO work must verify deployed origin and indexing behavior; a local placeholder build cannot do that.

## Exit criteria

- [ ] HP-012 includes representative measurements and resolved material regressions.
- [ ] HP-013 counts are complete above REST row limits and failures cannot appear as healthy zero activity.
- [ ] P2 work has an explicit remaining schedule and does not silently hold up an otherwise verified launch.
- [ ] Every accepted optimization preserves ownership, exact money, complete totals and error behavior.
- [ ] Changed documentation, component behavior and metadata have focused verification evidence.
