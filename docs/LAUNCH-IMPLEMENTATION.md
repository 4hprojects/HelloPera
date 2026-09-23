# Free launch implementation — 23 September 2026

This is the current release record. Earlier phase documents describe intended
capabilities, not proof that every user workflow is finished or deployed.

## Implemented in this working tree

- Bill, receivable, and expected-income detail pages with shared payment forms,
  existing-transaction linking, cancellation, and paginated lists.
- Transaction voiding and account archive/restore controls. Corrections retain history.
- Atomic, user-scoped idempotent payments; validated recurring fulfillment;
  voiding reopens linked expectations. Server-only RPC permissions.
- Complete obligation totals in a database snapshot, including allocation sums;
  complete expected-event reads with a hard failure instead of partial totals.
- 9 MB action request allowance with an 8 MB file limit; uploads check ready-state
  writes and clean up partial objects after failure.
- Resumable account deletion. A durable marker freezes financial/storage writes.
  Google deletion uses a browser/account-bound challenge, fresh OAuth method timestamp,
  ten-minute expiry, and atomic one-use consumption. Password reauthentication remains.
- Auth-user deletion erases identifying audit history and billing event payloads,
  leaving one anonymous deletion event. Failure messages describe partial progress.
- Export v2 retains old sections and adds payment links and expected events. The
  RLS-scoped RPC reads one MVCC snapshot and serializes money as decimal strings.
- Free-launch availability copy, disabled OCR UI, and enforced CSP.
- Isolated PostgreSQL migration/behavior tests, public browser/accessibility checks,
  staging finance/concurrency suites, recovery verifier, and performance fixtures.

## Migration and deployment order

Apply the three `20260923` migrations to the isolated staging project first,
then deploy this application to staging. The application now requires the new
RPCs; deploying it before those migrations will break financial reads/exports.
Run `npm run test:db` before applying migrations. Do not point staging tests at
production. Complete staging and recovery gates before the production migration
and application deployment. Roll back the application to its prior release if
needed; the additive migrations can remain, retaining integrity protections.

The working tree contained substantial unrelated hardening work before this
implementation. It has been preserved. Review changes as these release units:

1. Existing workflow/runtime/observability baseline.
2. Financial SQL and service changes, shared payment pages and correction controls.
3. Upload and account deletion safety, OAuth callback, privacy text.
4. Complete reads/exports, public availability copy, accessibility.
5. Verification tooling, CI, monitoring, and launch documentation.

No production migration or deployment has been performed by this implementation.

## Verification commands

Use Node 22 (`nvm use`).

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- `npm run test:db`: executes actual migrations/functions in isolated PGlite PostgreSQL.
  The bootstrap supplies minimal Auth/Storage schemas. It does **not** emulate
  Supabase Auth HTTP, storage bytes, cron, or multiple concurrent DB sessions.
- `npm run test:e2e`: public Chromium flows at 375, 768, and 1280 px; Axe AA scans,
  keyboard labels/focus, layout overflow, and CSP violations. Requires a completed build.
- `npm run test:integration`: requires an explicitly selected isolated Supabase
  project. Exercises real RLS/storage and concurrent payment requests.
- `npm run test:e2e:staging`: public checks plus authenticated finance workflows.
- `npm run test:performance:medium` / `npm run test:performance:large`: temporary
  staging fixtures matching PERFORMANCE.md; 30 warm browser navigations per route.
  Artifacts report browser navigation latency, **not** service p95. Correlate with
  server timing logs. Repeat after a controlled staging restart for cold measurements.
- `npm run verify:restore`: read-only row-digest and storage SHA-256 comparison
  between two separate projects after restoration. Freeze fixture changes at the
  backup point; a changing source cannot establish restore parity.

## Local verification results

- Unit suite: 749 tests passed; the two subsequently added upload fault tests also passed (751 total tests across the current files).
- Database suite: all 28 migrations execute; new migrations replay; payment rollback,
  retry behavior, RLS, grants, recurring validation/voiding, complete reads/exports,
  challenge expiry/replay, write freeze, and audit erasure pass.
- Type checking, lint, and production build pass.
- Nine public browser checks pass on the standalone build across phone, tablet,
  and desktop, including Axe scans, dark theme, CSP, keyboard access, and tap targets.
- Staging integration command correctly refuses to run without
  `TEST_SUPABASE_PROJECT_REF`. No existing project was used as an implicit test target.

## Required external evidence — NOT VERIFIED

| Gate | Evidence required |
| --- | --- |
| Isolated staging | Project identifier, deployed build, migration versions; passing authenticated browser and concurrency suites |
| Google deletion | Real provider round-trip; wrong-account refusal; cancel, expiry, replay, and interrupted-deletion retry |
| Email | Delivered signup confirmation and password reset; expired-link behavior; support-mailbox reply |
| Recovery | Backup timestamp/retention, separate restored database, restored document bytes, RLS checks and measured recovery duration |
| Production domain | DNS, HTTPS, canonical origin, callback allowlist, robots and sitemap |
| Performance | Medium and large profiles, cold/warm measurements, service p50/p95 and query plans for measured bottlenecks |
| Operations | Named on-call owner, monitoring enabled, induced alert acknowledged, and hosting log-error-rate alert configured |
| Devices | Real phone keyboard/zoom/navigation and provider push tests before push is enabled |

These gates remain open until dated evidence is attached. Passing local tests is
not permission to mark them complete. Public registration should stay closed to
launch traffic until they pass. Push, AI/OCR, billing/premium, and advertising remain
separate deferred releases; this change does not enable them.

## CI and monitoring setup

The staging integration job now fails rather than reporting success when its
configuration is absent. Configure `STAGING_SUPABASE_URL`,
`STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_SECRET_KEY`,
`STAGING_SUPABASE_PROJECT_REF`, and `STAGING_APP_URL` in repository secrets.
The app URL must serve a deployment of this same release connected to that project.

`monitor.yml` checks readiness, integrity findings, recent failed jobs, and hourly
job freshness every 15 minutes when repository variable `LAUNCH_MONITORING_ENABLED`
is `true`. Set `PRODUCTION_APP_URL` and the production Supabase secrets. Configure
GitHub Actions failure notifications for the operator and test an induced failure.
No email/chat messages are sent by the application. Hosting-wide error spikes still
need a log-sink alert: error rate >5% with at least 5 failures in 15 minutes, with
request IDs only and no financial contents. Do not claim this alert is connected
until the platform owner validates delivery.


## Observations recorded during implementation

On 23 September 2026, `hellopera.online` and `www.hellopera.online` resolved in
this environment. HTTPS requests to the homepage, robots, sitemap, and readiness
endpoint timed out. This is not proof of an outage for all visitors, and is not a
successful production smoke test. Production access remains unverified.
