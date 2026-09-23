# HelloPera project audit checklist

> Superseded for release readiness by [LAUNCH-IMPLEMENTATION.md](LAUNCH-IMPLEMENTATION.md).
> Earlier completion marks describe the prior audit and must not substitute for
> the current browser, database, staging, and recovery gates.

Generated 20 September 2026 from a codebase audit of the Next.js/Supabase app.

## Current health snapshot

- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] Unit suite passes: 48 files, 731 tests.
- [x] `npm run build` passes.
- [ ] Local runtime matches project runtime. The repo requires Node 22, but the current shell ran Node 20.20.2.
- [x] Next 16 middleware deprecation is resolved. The request layer now uses the `proxy.ts` convention.
- [ ] Existing working tree changes are reviewed before broad refactors.

## Phase 1 - Stabilize developer workflow

Goal: make every local and CI run match production expectations.

- [x] Standardize Node 22 in local version metadata, CI, and the documented deployment image.
- [x] Add a preflight command that runs `check:key`, typecheck, lint, tests, and build in one place.
- [x] Add CI checks for typecheck, lint, unit tests, integration tests, and production build.
- [x] Keep integration tests separate from unit tests, and document the required live Supabase credentials.
- [x] Add a "known warnings" section to the launch checklist until warnings reach zero.
- [x] Keep `tsconfig.tsbuildinfo` ignored as local compiler output.

## Phase 2 - Framework modernization

Goal: reduce future upgrade friction and stay aligned with Next 16 conventions.

- [x] Read the local Next 16 migration note for `middleware` to `proxy`.
- [x] Migrate `middleware.ts` to the new `proxy` convention.
- [x] Verify auth redirects, public route access, admin protection, and API route behavior after the migration.
- [x] Add regression tests for proxy matching, maintenance behavior, session refresh, and route guards.
- [x] Re-run build and confirm the middleware/proxy warning is gone.

## Phase 3 - Product workflow polish

Goal: shorten the daily money-tracking loop.

- [x] Add direct dashboard capture actions for expenses, income, receipt uploads, and bills.
- [x] Preserve transaction intent by preselecting the type supplied by quick-action links.
- [x] Add inline next steps after creating accounts, transactions, bills, receivables, and expected income.
- [x] Keep four primary mobile destinations and move lower-frequency routes into an accessible More sheet.
- [x] Give empty states a useful next action, including filtered transaction results and first-use analytics/forecast screens.
- [x] Verify the first-run loop on a 375px viewport: sign in -> add account -> add income -> see the dashboard update.
- [x] Explain the processing, readiness, and review steps after a document upload.

## Phase 4 - Runtime efficiency

Goal: keep private finance screens fast as data grows.

- [ ] Measure dashboard and private-list latency against the medium and large profiles in `docs/PERFORMANCE.md`. The connected project is currently empty, so its plan timings are not a realistic baseline.
- [x] Add privacy-safe timing logs around dashboard, analytics, transactions, documents, and notifications.
- [x] Build the dashboard projection from its existing account and obligation reads instead of starting a second query batch.
- [x] Log analytics row counts and keep the move-to-grouped-SQL threshold explicit at 20,000 rows.
- [x] Replace exact counts on transaction and notification lists with one-row lookahead pagination.
- [x] Review cursor pagination and record the trigger and multi-sort requirements before changing URL behavior.
- [x] Inspect live query plans before adding indexes. The database is empty, so no speculative index was added.

## Phase 5 - Data and operational reliability

Goal: protect user financial data and background workflows before public use.

- [ ] Complete the backup and restore drill from the launch checklist.
- [x] Confirm `pg_cron` availability and all six expected schedules on the live project.
- [ ] Configure push VAPID keys and scheduler secret before relying on notification delivery. Push is now gated and safely off meanwhile.
- [ ] Configure production email before opening signups.
- [ ] Choose and integrate a payment provider before enabling billing/premium flags.
- [x] Confirm an active admin exists and test `/admin` and `/admin/users` end to end.
- [x] Keep provider-backed feature flags default-off and enforce OCR/push gates in their service paths.

## Phase 6 - Observability and support readiness

Goal: make failures diagnosable without exposing private financial data.

- [x] Add structured request IDs to server logs.
- [x] Record service-level timings without logging amounts, notes, merchant names, document names, or personal data.
- [x] Add lightweight health checks for Supabase connectivity, storage, image processing, scheduler auth, and AI/OCR provider configuration.
- [x] Add admin visibility for failed document processing, failed notification delivery, scheduler job runs, and billing webhook errors.
- [x] Create a support runbook for common production issues: email not sending, domain misconfigured, scheduler stopped, upload failure, payment webhook failure.

## Phase 7 - UX and accessibility pass

Goal: make the app easier, clearer, and safer for stressed mobile users.

- [ ] Test the main flows on a small phone viewport.
- [ ] Check tap target size and spacing on dense lists and filter rows.
- [ ] Ensure destructive operations explain impact and preserve a recovery path where possible.
- [ ] Audit form errors so each one says what happened and how to fix it.
- [ ] Confirm color is never the only status cue.
- [ ] Check keyboard navigation and visible focus across app, auth, public, and admin shells.
- [ ] Run an accessibility scan on public pages before SEO/AdSense submission.

## Phase 8 - Launch sequencing

Goal: avoid enabling public, paid, or automated surfaces prematurely.

- [ ] Finish Phase 1 and Phase 2 first because they affect every later change.
- [ ] Finish the launch checklist operational blockers before publishing the public site.
- [ ] Enable scheduler and notifications before depending on reminders.
- [ ] Enable AI/OCR/provider features only after keys, limits, failure modes, and flags are tested.
- [ ] Enable billing only after provider sandbox tests, webhook replay tests, cancellation tests, and account deletion behavior are verified.
- [ ] Watch logs and metrics for the first production users before adding ads or monetization pressure.
