# Phase 2 — core flows and accessibility

## Goal and entry requirements

Make daily tracking understandable and recoverable on a small phone as well as larger screens. Reuse the [Jade design system](../docs/DESIGN-SYSTEM.md), existing semantic tokens, field primitives and navigation patterns. Phase 1 fixes relevant to a journey must pass before its acceptance run; authenticated work requires the isolated staging environment from HP-016.

The target is a user trying to record real money quickly, not a user learning implementation phases. Explain what happened, what remains and the next safe action. Preserve entered values on recoverable errors. Distinguish pending amounts and forecasts from actual balances.

## Work packages

| Canonical task                             | Priority | Outcome                                                                      |
| ------------------------------------------ | -------- | ---------------------------------------------------------------------------- |
| [HP-009](02-prioritized-backlog.md#hp-009) | P1       | Complete core journeys, correct currency behavior and accessibility evidence |
| [HP-011](02-prioritized-backlog.md#hp-011) | P1       | Complete exports and resumable deletion proven with real hosted storage      |
| [HP-010](02-prioritized-backlog.md#hp-010) | P2       | Better older-transaction selection and explicit upload/payment recovery      |

## Journey acceptance matrix

| Journey                   | Required states and checks                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signup/login/reset        | Delivered/expired/reused link, invalid credentials, provider error, disabled account, safe redirect; delivery evidence belongs to HP-017           |
| First use                 | Empty dashboard → account → opening balance/income → reconciled dashboard; obvious next action after each save                                     |
| Daily ledger              | Expense, income, adjustment, same-currency transfer, filtered history, void/correction; partial failure must not claim success                     |
| Multiple currencies       | Profile-default PHP with a USD account, type changes, mismatched transfer destination, currency labels and separated totals                        |
| Bills and incoming money  | Create bill/receivable/expected income → partial/full payment or collection → existing transaction link → void/reopen → cancellation               |
| Recurring and forecasting | Pause/resume, month-end/leap-year/timezone boundaries, generation failure, skipped/fulfilled occurrence, forecast assumptions                      |
| Documents                 | JPEG/PNG/WebP/HEIC/PDF as actually supported by the container, 2 MB/8 MB/oversize, invalid bytes, duplicate, rendition failure and download denial |
| Export                    | Empty and large account, JSON/CSV, exact amounts, allocations/events, spreadsheet-safe text, document-metadata-only explanation                    |
| Deletion                  | Password and Google reauthentication, expired challenge, interrupted storage sweep, Auth failure, read-only banner and successful resume           |

## Visual and accessibility protocol

Use the configured 375×812, 768×1024 and 1280×900 viewports. At each width, inspect the critical journey in light and dark themes, then cover keyboard-only navigation, visible focus, modal close/focus return, 200% zoom, long labels, browser autofill and validation announcements. Check a real phone for safe-area, software keyboard and file-picker behavior. Add Safari/Firefox smoke evidence; Chromium viewport emulation is not a substitute.

Automated axe scans complement manual review; existing tests use WCAG 2/2.1 A/AA tags and do not certify the project's WCAG 2.2 AA goal. Inspect contrast, touch targets, reflow, error association and chart text alternatives. For destructive actions verify clear impact, deliberate confirmation and an honest recovery route when only part of the operation finishes.

## Exit criteria

- [ ] HP-009 and HP-011 acceptance evidence is attached at all applicable sizes.
- [ ] All core balances and obligation totals reconcile after create, link, retry and void.
- [ ] Invalid and interrupted actions preserve input and give an actionable outcome.
- [ ] Private-screen keyboard, theme, zoom and device reviews are recorded, with any unresolved accessibility failures prioritized by user impact.
- [ ] No privacy-sensitive data appears in screenshots or shared traces.

HP-010 is a quality improvement, not a blanket launch blocker. Promote a specific subcase to P1 only if testing establishes that a core supported task cannot be completed safely.
