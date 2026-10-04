# Project analysis

## Assessment

HelloPera has a substantial working implementation, not merely a scaffold: **61 page modules, eight route handlers, 11 server-action modules, 29 service modules and 28 migrations**. The project is a mobile-first personal finance tracker and document store, with provider-backed capabilities intentionally deferred. The existing architecture is worth retaining; the highest-value work is boundary correctness and launch proof, not a rewrite.

The audit combines repository-wide inventory, targeted source tracing, existing local tests, additional isolated probes and public browser verification. It is not a line-by-line proof of every branch or a live penetration test. Private UI, deployed infrastructure and real provider behavior require staging evidence. See [validation](08-validation-and-evidence.md) for exact coverage.

The intended users are people recording daily personal finances, often on a phone, who need fast entry and dependable balances. This follows the [master plan](../docs/HELLOPERA-MASTER-PLAN.md); no new user research was conducted. The UX review therefore prioritizes clarity, preserved input, explicit outcomes and recovery from interrupted work. Marketing pages can retain brand illustration; repeated finance screens should prioritize readable figures and actions within the existing Jade system.

## Architecture and trust boundaries

| Layer      | Current implementation                                                             | Assessment                                                                                           |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Runtime    | Next.js 16.3.5, React 19.1.1, TypeScript, Tailwind 4; Node 22 required             | Local shell initially used Node 20; audit checks explicitly used installed Node 22.23.1              |
| Routing    | App Router groups for public, auth and app; separate admin tree                    | Clear separation; guards must still protect individual actions and sensitive reads                   |
| Session    | Supabase SSR cookies, request proxy refresh, server `getUser()`                    | Authentication and account-status authorization are distinct; download path omits the latter         |
| Writes     | Server actions → Zod/services → privileged client/RPC                              | Privileged writes bypass RLS, so caller ownership and database invariants are critical               |
| Reads      | Mostly session-scoped Supabase client and RLS                                      | Good default; numeric transport and multi-request snapshots need attention                           |
| Ledger     | SQL RPCs, row locks, triggers; `numeric(18,2)` plus bigint application arithmetic  | Atomic payments and exact exports are strengths; ordinary transaction retries lack deduplication     |
| Documents  | Private Supabase bucket, byte validation, Sharp renditions, 120-second signed URLs | Bounded uploads and explicit ownership; status authorization and real storage behavior need closure  |
| Automation | Postgres recurrence/notification jobs; HTTP scheduler for push                     | Source exists; live schedules, dispatch, failure alerts and provider configuration not reverified    |
| Delivery   | GitHub CI, guarded staging release, manual production promotion, HelloDeploy       | Strong release scaffolding; current hosting compatibility and release evidence remain external gates |

Source entrypoints: [package scripts](../package.json), [proxy](../proxy.ts), [guards](../lib/auth/guards.ts), [admin client](../lib/supabase/admin.ts), [CI](../.github/workflows/ci.yml), [release workflow](../.github/workflows/release.yml).

### Critical flows traced

1. **Manual transaction:** form → authenticated action → finance schema → `create_transaction` → account locks, transaction and balance updates → cache invalidation. A grouped amount passes schema validation unchanged; duplicate requests have no request ID. Account selection can disagree with the hidden profile-default currency.
2. **Obligation payment:** detail page creates request ID → payment schema canonicalizes at service boundary → `record_obligation_payment` serializes per-user work and creates/links atomically → revalidated remaining balance. Reusing a key with changed data is refused; the UI requires reload for another payment.
3. **Document upload/download:** action checks size and identity → byte validation → metadata row → object upload/renditions → ready or failed state. Download validates session and ownership but not active/verified profile status. Original files remain distinct from stripped display renditions.
4. **Analytics and forecast:** server reads → pure currency-aware aggregates → rendered summaries. Analytics uses sequential offset pages; stable sorting alone cannot ensure a single snapshot during concurrent writes. Forecast can trigger lazy generation on read.
5. **Export/deletion:** export uses one RLS-scoped snapshot RPC with decimal strings; deletion reauthenticates, freezes writes, removes bucket objects, then deletes Auth identity. Local tests cover selected failure paths; actual storage/auth interruption and recovery remain staging work.
6. **OCR confirmation:** action creates a financial record before `confirm_extraction` validates and links the extraction. Provider generation is gated, but this confirmation action lacks the same flag and financial-freeze checks. This must be closed for the free launch even while OCR stays disabled.
7. **Admin operation:** action rechecks admin role/status and reason, invokes a restricted operation, then best-effort audit logging. Admin overview counts are calculated from unpaginated REST rows and may show zero on query failure.

## Feature inventory and coverage

| Surface                  | Present                                                                            | Remaining review/implementation                                                     |
| ------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Public website           | Landing, features, pricing, about, help, contact, FAQ, legal, guides               | Broader page/keyboard/theme coverage; deployed canonical and indexing checks        |
| Authentication           | Email/password, Google button/callback, verification, password reset, status pages | Delivered email, expired/replayed links, OAuth and prelaunch signup closure         |
| Accounts and ledger      | Accounts, opening balances, income/expense/transfer/adjustment, void/archive       | Retry protection, canonical inputs, currency selection, transport precision         |
| Obligations              | Bills, receivables, expected income, details, partial payments and cancellation    | Full collection browser journeys; existing-transaction picker limited to latest 100 |
| Documents                | Upload/archive, private download, image processing, PDF originals, review          | Suspended-account denial, real codec/storage tests, failure/retry UX                |
| Analytics                | Server aggregates, filters, per-currency charts                                    | Snapshot stability and representative load measurements                             |
| Recurring and forecast   | Rules, occurrences, fulfillment, projections and generation                        | Freeze coverage, stale-generation feedback, timezone and lifecycle browser tests    |
| Notifications            | In-app list/preferences, generation, push foundation                               | Live cron proof; push remains deferred                                              |
| Settings and data rights | Profile, plan, notifications, export, resumable deletion                           | End-to-end real storage deletion/retry and export completeness                      |
| Administration           | Users, flags, usage, jobs, integrity, audit, subscriptions, content                | Complete metrics and visible failure state; mutation/audit atomicity                |
| OCR and assistant        | Provider adapters, quotas, structured processing and review                        | Confirmation atomicity, concurrency limits, live provider failure tests             |
| Billing and ads          | Lifecycle/webhook foundation, no-op billing adapter, consent and ad gates          | Separate activation projects; not required for free launch                          |
| PWA                      | Manifest, icons, push service worker                                               | Device install checks; no offline financial data cache is implemented               |

## Strengths to preserve

- Bigint money helpers and currency-separated aggregation avoid arithmetic drift after data reaches the application intact.
- Payment replay, over-allocation rollback, void/reopen behavior and selected RPC permissions are exercised on an isolated PostgreSQL engine.
- Export uses an RLS-scoped snapshot and explicitly casts money to text, avoiding row caps and numeric JSON loss on that path.
- Deletion acknowledges partial progress instead of claiming rollback across independent services.
- Provider flags default off, no-op billing refuses unverified events, and maintenance health probes are independent of authentication.
- Semantic tokens, labeled form primitives, native mobile dialog navigation, textual chart values and public accessibility tests provide a useful foundation.
- Release scripts check target identity, exact commit and migration evidence; staging fixtures have production-target rejection.

## Highest-impact findings

See [the backlog](02-prioritized-backlog.md) for implementation details. Main groups are authorization consistency (HP-002/HP-003/HP-008), money and retry boundaries (HP-004–HP-007), core user-flow evidence (HP-009/HP-011), trustworthy operations (HP-013/HP-016–HP-019), and ledger freeze/audit guarantees (HP-025/HP-026).

The current production dependency audit reports a critical Next.js advisory. The affected dependency version is confirmed; exploitable application usage was not found. HP-001 records the exact advisory and patch verification requirements. This updates the September record's historical zero-vulnerability observation.

## Documentation discrepancies

| Existing record/comment                                        | Current evidence                                                                    | Treatment                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Earlier audit checklist marks historical checks complete       | Current execution is separately dated in this folder                                | Do not inherit checkmarks as launch proof                 |
| README describes all mutations requiring a secret at startup   | Environment module permits public build without one; writes require it when invoked | Clarify runtime/build distinction in HP-014               |
| `recordPaymentAction` comment describes two independent writes | Current service calls an atomic replay-aware RPC                                    | Correct comment in HP-014; preserve atomic implementation |
| Service comments say `server-only` prevents unit tests         | Vitest aliases it and multiple services already have tests                          | Correct testing guidance in HP-014                        |
| Financial freeze comment says flag-read failure permits writes | `isFlagEnabled` catches failures and returns false, so normal failures deny writes  | Adopt explicit fail-closed policy and test under HP-025   |
| Old refinement notes say no browser/database run occurred      | Later launch record describes runs; this audit reruns local checks                  | Retain chronology; link the newest evidence               |
| Historical hosting/domain statements in comments               | No live environment inspected in this audit                                         | Do not infer current DNS or deployment status             |

## Limitations

No real environment files were read for values, no staging fixtures were created, and no migrations, deployments or provider activations were performed. Local database tests use a minimal Auth/Storage schema; they do not emulate hosted Supabase HTTP behavior, cron scheduling, backups or container codecs. Public Chromium viewport checks do not establish private-screen usability, Safari/Firefox compatibility or WCAG 2.2 AA conformance. Legal pages were inventoried for consistency, not certified for legal compliance.
