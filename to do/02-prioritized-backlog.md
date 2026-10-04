# Prioritized implementation backlog

Audit: 1 October 2026. These are **future tasks**, not changes performed by the audit. Evidence labels describe the stated observation, not a production exploit claim. See [priority rules](README.md) and [check results](08-validation-and-evidence.md).

## Priority index

| ID                | Priority | Phase | Status   | Task                                                              |
| ----------------- | -------- | ----- | -------- | ----------------------------------------------------------------- |
| [HP-001](#hp-001) | P1       | 1     | in progress | Patch the flagged Next.js dependency                              |
| [HP-002](#hp-002) | P1       | 1     | in progress | Enforce account status on document downloads                      |
| [HP-003](#hp-003) | P1       | 1     | in progress | Close the extraction confirmation write bypass                    |
| [HP-004](#hp-004) | P1       | 1     | in progress | Canonicalize money and validate real dates                        |
| [HP-005](#hp-005) | P1       | 1     | in progress | Preserve money precision across all database reads                |
| [HP-006](#hp-006) | P1       | 1     | in progress | Make ordinary ledger creation retry-safe                          |
| [HP-007](#hp-007) | P1       | 1     | in progress | Ensure analytics reads a consistent financial snapshot            |
| [HP-008](#hp-008) | P1       | 1     | in progress | Complete authorization and privilege regression coverage          |
| [HP-025](#hp-025) | P1       | 1     | in progress | Make the financial freeze comprehensive and explicit              |
| [HP-026](#hp-026) | P1       | 1     | in progress | Make privileged administrative changes durably auditable          |
| [HP-009](#hp-009) | P1       | 2     | in progress | Verify complete core journeys and fix currency selection          |
| [HP-011](#hp-011) | P1       | 2     | open     | Prove export and resumable deletion on hosted storage             |
| [HP-012](#hp-012) | P1       | 3     | open     | Establish realistic performance and capacity baselines            |
| [HP-013](#hp-013) | P1       | 3     | open     | Make admin metrics complete and failures visible                  |
| [HP-016](#hp-016) | P1       | 4     | blocked  | Provision isolated staging and verify the release platform        |
| [HP-017](#hp-017) | P1       | 4     | blocked  | Verify signup closure, email, OAuth and public production routing |
| [HP-018](#hp-018) | P1       | 4     | blocked  | Complete a database and document restore drill                    |
| [HP-019](#hp-019) | P1       | 4     | blocked  | Establish monitoring, scheduler and support ownership             |
| [HP-010](#hp-010) | P2       | 2     | in progress | Improve document and payment recovery UX                          |
| [HP-014](#hp-014) | P2       | 3     | open     | Reconcile docs and streamline maintainability                     |
| [HP-015](#hp-015) | P2       | 3     | open     | Review headers and rate-limit deployment assumptions              |
| [HP-024](#hp-024) | P2       | 3     | open     | Broaden public-site and PWA quality coverage                      |
| [HP-020](#hp-020) | P3       | 5     | deferred | Qualify OCR and AI before provider activation                     |
| [HP-021](#hp-021) | P3       | 5     | deferred | Qualify push delivery and device lifecycle                        |
| [HP-022](#hp-022) | P3       | 5     | deferred | Implement and qualify a billing provider                          |
| [HP-023](#hp-023) | P3       | 5     | deferred | Qualify advertising and consent independently                     |

P0: none demonstrated. P1 items are free-launch gates; P2 items may be scheduled after launch; P3 activation remains deferred. HP-016 provisioning can start immediately to unblock staging evidence. Dependency ranges such as HP-002–HP-008 mean the relevant tasks in that inclusive range.

<a id="hp-001"></a>

## HP-001 — Patch the flagged Next.js dependency

**Priority:** P1 · **Phase:** 1 · **Status:** in progress · **Evidence:** confirmed dependency advisory; application exploit not established
**Area:** Framework/security · **Responsible role:** Frontend + security · **Estimate:** M
**Dependencies:** None

**Evidence / reproduction:** [package.json](../package.json), [lockfile](../package-lock.json), current npm audit, and [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j). Next 16.3.5 is in the affected range; the advisory lists 16.3.6 as patched and npm suggests 16.3.8. No `next/og` or `ImageResponse` usage was found in app/lib/services/components; social images are static PNGs.

**Impact:** An installed critical advisory invalidates the historical clean dependency result. It does not establish that this application is exploitable.

**Implementation:** Update Next and its matching ESLint config to 16.3.8, refresh the lockfile deliberately, and read the installed upgrade/security notes. Recheck the advisory at implementation time; use a newer supported patch if required by a newly published advisory. Do not run a blind force upgrade.

**Acceptance:** Runtime, lint, types, unit/database tests, standalone build, public browser checks, auth and action regressions pass. Production dependency audit has no unresolved high/critical finding without documented applicability review.

**Verification / interfaces:** `npm audit --omit=dev --json`; repeat source usage search and complete the validation matrix. No public API change is intended.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-002"></a>

## HP-002 — Enforce account status on document downloads

**Priority:** P1 · **Phase:** 1 · **Status:** in progress · **Evidence:** confirmed guard inconsistency; live denial scenario unverified
**Area:** Auth/storage · **Responsible role:** Backend + QA · **Estimate:** S
**Dependencies:** None

**Evidence / reproduction:** [Download route](../app/api/documents/[id]/[which]/route.ts), [storage service](../services/storage.service.ts), [guards](../lib/auth/guards.ts). Route calls `getCurrentUser`; privileged signing checks ownership only.

**Impact:** An authenticated suspended, disabled or unverified owner can reach a weaker authorization path than the protected app uses.

**Implementation:** Require active, verified account authorization before signing, using shared guard semantics with API-appropriate unauthorized/forbidden responses. Retain indistinguishable not-found responses for missing and foreign documents and private no-store headers.

**Acceptance:** Anonymous, unverified, suspended and disabled callers obtain no new signed URL; active owner succeeds; another user and an admin who is not the owner cannot read it. Existing bearer URLs are documented as valid only until their 120-second expiry.

**Verification / interfaces:** Route/service tests for every identity and rendition; staging direct requests after status changes. Keep route path and successful redirect behavior compatible.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-003"></a>

## HP-003 — Close the extraction confirmation write bypass

**Priority:** P1 · **Phase:** 1 · **Status:** in progress · **Evidence:** confirmed code ordering and missing guards; concurrency outcome unverified
**Area:** OCR/server actions/ledger · **Responsible role:** Backend + database · **Estimate:** L
**Dependencies:** HP-004, HP-025

**Evidence / reproduction:** [Extraction actions](../app/actions/extraction.ts) create the target record before calling `confirm_extraction`; confirmation has no OCR feature gate or ledger-freeze guard. [OCR service](../services/ocr.service.ts) gates generation separately.

**Impact:** Replays or invalid extraction IDs can leave extra own-user financial records before linking is rejected. Disabling provider generation does not disable this write path.

**Implementation:** For free launch, refuse confirmation while OCR is off and while financial writes are frozen, before any mutation. Before enabling OCR, replace create-then-confirm with one transactional, owner-scoped RPC that locks the extraction, validates pending state and target, creates the record and links it atomically. Reuse full target schemas; validate target enum and document/extraction relationship.

**Acceptance:** Disabled/frozen, foreign, absent and already-confirmed extraction requests create zero new records. Concurrent confirmation creates exactly one financial record and link; retries return its result. Invalid money/date/category/account is refused before writing.

**Verification / interfaces:** Add action guard tests and isolated database rollback/replay tests, then staging concurrent submissions. New internal RPC and typed result are expected; add a forward migration and update the data-model reference.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-004"></a>

## HP-004 — Canonicalize money and validate real dates

**Priority:** P1 · **Phase:** 1 · **Status:** in progress · **Evidence:** confirmed by isolated schema and database probes
**Area:** Input contracts · **Responsible role:** Backend + frontend · **Estimate:** M
**Dependencies:** None

**Evidence / reproduction:** [Finance schemas](../schemas/finance.schema.ts), [money parser](../lib/money/index.ts), [transaction service](../services/transaction.service.ts), [account service](../services/account.service.ts). Probe accepted amount `1,234.56` unchanged and date `2026-02-31`; PostgreSQL numeric cast rejected the grouped amount with 22P02.

**Impact:** Accepted user input can fail later with a generic save error. Validation and persistence disagree.

**Implementation:** Transform accepted amount strings to canonical decimal strings after exact parsing for accounts, transactions, obligations and recurring inputs. Enforce numeric(18,2) bounds before persistence. Replace Date.parse-only date validation with calendar round-trip validation; retain date-only/timezone semantics. Reject bare punctuation and malformed grouping explicitly.

**Acceptance:** Plain/grouped supported amounts persist identically; zero and negatives follow each field contract; excess precision and overflow produce field errors. Invalid month/day and non-leap February 29 fail; valid leap day passes. Schema output is canonical, not just validated.

**Verification / interfaces:** Table-driven schema tests plus RPC-boundary tests using grouped amounts, symbols, whitespace, maximum values and calendar edges. Input UX remains permissive only where canonicalization is implemented.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-005"></a>

## HP-005 — Preserve money precision across all database reads

**Priority:** P1 · **Phase:** 1 · **Status:** in progress · **Evidence:** confirmed numeric JSON mechanism; hosted affected paths require verification
**Area:** Finance transport · **Responsible role:** Backend + database · **Estimate:** L
**Dependencies:** None

**Evidence / reproduction:** [Account reads](../services/account.service.ts), [transaction reads](../services/transaction.service.ts), [analytics reads](../services/analytics.service.ts), [money helper](../lib/money/index.ts). They type numeric values as strings without enforcing wire representation. The [export migration](../supabase/migrations/20260923000300_export_snapshot.sql) already casts to text. Isolated JSONB probe changed 9999999999999999.99 to JS 10000000000000000 when not cast.

**Impact:** Bigint arithmetic cannot restore digits already rounded by JSON parsing; apparent TypeScript string types do not change runtime values.

**Implementation:** Inventory every money-bearing read, including account balances, transaction pickers, analytics, recurring events and admin repairs. Return decimal text through typed RLS-safe projections/RPCs, preserving invoker security where possible. Reject unexpected numeric money at critical boundaries after migration; never repair by rounding a JS number.

**Acceptance:** Maximum supported amounts and one-cent differences survive database → HTTP → service → display/export unchanged. RLS isolation and all existing filters/sorts remain valid.

**Verification / interfaces:** Hosted PostgREST round-trip integration with boundary values, plus isolated SQL serialization assertions. New text-valued read DTOs/RPCs may be necessary; add migrations without relaxing grants.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-006"></a>

## HP-006 — Make ordinary ledger creation retry-safe

**Priority:** P1 · **Phase:** 1 · **Status:** in progress · **Evidence:** confirmed absence of replay contract; duplicate scenario not executed
**Area:** Transactions/accounts · **Responsible role:** Backend + database · **Estimate:** L
**Dependencies:** HP-004

**Evidence / reproduction:** [Finance actions](../app/actions/finance.ts), [transaction service](../services/transaction.service.ts), [creation RPC](../supabase/migrations/20260913000300_phase02_transaction_rpc.sql). Ordinary creation carries no request ID; [obligation payments](../supabase/migrations/20260923000100_launch_integrity.sql) provide an existing replay pattern.

**Impact:** A lost response followed by retry can record the same movement twice, even if the button is disabled while pending.

**Implementation:** Introduce a stable per-submission request ID and normalized payload identity for manual transaction and account/opening-entry creation. Enforce uniqueness and replay atomically in SQL; retain the key after uncertain failures and replace it only for a new intent. Do not deduplicate legitimate repeated transactions by amount/date alone.

**Acceptance:** Concurrent identical requests produce one ledger effect; changed payload with the same key is rejected; distinct keys allow legitimate repeats; lost-response retry returns the original result. Opening balance is never duplicated.

**Verification / interfaces:** Isolated replay/rollback tests and staging concurrent/lost-response cases. Extend action inputs and internal RPC contracts with an additive request-key migration.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-007"></a>

## HP-007 — Ensure analytics reads a consistent financial snapshot

**Priority:** P1 · **Phase:** 1 · **Status:** in progress · **Evidence:** suspected concurrent-read inconsistency grounded in code
**Area:** Analytics/dashboard · **Responsible role:** Backend + database · **Estimate:** L
**Dependencies:** HP-005; HP-016 staging setup for reproduction

**Evidence / reproduction:** [Analytics service](../services/analytics.service.ts) reads 1,000-row offset pages in separate requests, ordered by date/id. This stabilizes sorting but does not create a shared MVCC snapshot.

**Impact:** Insertions, voids or date changes between pages may skip or repeat records and display totals that do not reconcile.

**Implementation:** Reproduce with more than 1,000 rows and a mutation between page reads. Move the selected-window read/aggregation into one RLS-scoped snapshot RPC, preserving filters, refund attribution, exact strings and explicit size failures. If reproduction disproves the scenario, attach evidence before closing.

**Acceptance:** During concurrent insert/void, each result corresponds to one consistent snapshot, with no duplicate or missing contribution. PHP and other currencies remain separate; no partial result is presented as complete.

**Verification / interfaces:** Controlled integration synchronization between pages, baseline-versus-snapshot reconciliation and existing aggregate tests. Document the new read contract and performance impact.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-008"></a>

## HP-008 — Complete authorization and privilege regression coverage

**Priority:** P1 · **Phase:** 1 · **Status:** in progress · **Evidence:** unverified full matrix; selected local checks pass
**Area:** Auth/RLS/admin · **Responsible role:** Security + backend + QA · **Estimate:** L
**Dependencies:** HP-002, HP-003; HP-016 staging setup

**Evidence / reproduction:** [Guard tests](../lib/auth/guards.test.ts), [database runner](../scripts/test-database.mjs), [storage integration](../services/storage.integration.test.ts), [admin privacy tests](../services/admin.privacy.test.ts). Selected checks are not a full route/action/RPC authorization matrix.

**Impact:** The privileged service client makes an omitted check consequential. A layout redirect alone is not proof that a sensitive read or action is protected.

**Implementation:** Map all actions and eight route handlers to identity, active status, role, ownership, input validation and audit boundaries. Exercise direct action/API requests and RLS reads with two users, not only navigation. Check function grants/search paths and direct client-write refusal; retain narrow admin data projections.

**Acceptance:** Foreign identifiers, role spoofing, stale sessions, disabled accounts and direct browser writes fail without data leakage or mutation. Every sensitive entrypoint has an explicit reviewed boundary and meaningful regression coverage.

**Verification / interfaces:** Local unit/database tests plus isolated hosted Auth/Storage/PostgREST integration. Do not introduce a repositories layer solely for this audit.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-009"></a>

## HP-009 — Verify complete core journeys and fix currency selection

**Priority:** P1 · **Phase:** 2 · **Status:** in progress · **Evidence:** confirmed form mismatch; private browser experience unverified
**Area:** Product flows/accessibility · **Responsible role:** Frontend + QA · **Estimate:** L
**Dependencies:** HP-002–HP-008 as relevant; HP-016 staging setup

**Evidence / reproduction:** [Transaction form](<../app/(app)/transactions/new/new-transaction-form.tsx>) offers accounts but submits hidden profile-default currency. [Browser finance test](../tests/e2e/finance.spec.ts) covers one income/bill path, not all currencies or workflows. [Public tests](../tests/e2e/public.spec.ts) cover eight routes and one dark-theme route.

**Impact:** Choosing a non-default-currency account can fail with currency mismatch; uncovered flows can leave users unable to finish daily tasks.

**Implementation:** Derive transaction currency from the selected account; transfers must select a destination with the same currency and clear stale choices on type/account change. Use the profile timezone for the default transaction date rather than the current UTC `toISOString()` date. Expand journeys to expense, transfer, receivable/expected-income collection, recurrence and correction. Audit keyboard/focus, labels, announced errors, preserved input, empty/loading states, long names and mobile More navigation using existing primitives.

**Acceptance:** Phone/tablet/desktop journeys reconcile balances and finish without dead ends; PHP-profile users can transact in a USD account without changing profile defaults; cross-currency transfers are clearly refused; date defaults are correct around local midnight. Keyboard, zoom, light/dark and screen-reader checks have dated results against WCAG 2.2 AA targets.

**Verification / interfaces:** Extend staging browser tests, including no-account first use and failure recovery; manually inspect private screens. Automated axe tags currently stop at WCAG 2.1 and do not certify 2.2 compliance.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-010"></a>

## HP-010 — Improve document and payment recovery UX

**Priority:** P2 · **Phase:** 2 · **Status:** in progress · **Evidence:** confirmed bounded picker/reload behavior; upload recovery UX unverified
**Area:** Documents/payments · **Responsible role:** Frontend + backend · **Estimate:** M
**Dependencies:** HP-003, HP-009

**Evidence / reproduction:** [Payment form](../components/finance/payment-form.tsx) requests reload after success; [detail component](../components/finance/obligation-detail.tsx) limits existing transactions to 100. [Upload service](../services/document.service.ts) retains failed metadata rows and cleans partial objects.

**Impact:** Older matching transactions are unavailable in the picker, and users need clearer next steps after partial success or upload failure.

**Implementation:** Add a deliberate Record another payment action that obtains a new request key; add searchable paginated matching transactions with remaining allocatable amount. Provide an explicit retry/re-upload path for failed documents, preserving useful classification and explaining duplicate warnings and PDF preview limits.

**Acceptance:** A transaction older than 100 matches is selectable; fully allocated entries cannot mislead users; a new payment gets a fresh key while retry preserves the old one. Failed upload has an actionable recovery path and no false success.

**Verification / interfaces:** Browser tests for selection pagination, repeated payment, duplicate upload, failed renditions and retry. Preserve server-side allocation and ownership enforcement.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-011"></a>

## HP-011 — Prove export and resumable deletion on hosted storage

**Priority:** P1 · **Phase:** 2 · **Status:** open · **Evidence:** unverified external behavior; local selected cases pass
**Area:** Data rights/recovery · **Responsible role:** Backend + QA · **Estimate:** L
**Dependencies:** HP-005, HP-008; HP-016 staging setup

**Evidence / reproduction:** [Export service](../services/export.service.ts), [deletion service](../services/account-deletion.service.ts), [deletion tests](../services/account-deletion.test.ts), [finance browser test](../tests/e2e/finance.spec.ts). Local DB tests cover snapshot/grants/freeze/cascade; unit storage behavior is mocked.

**Impact:** Users depend on complete exports and truthful deletion outcomes across systems that cannot roll back together.

**Implementation:** Run isolated fixtures above 1,000 records and multiple storage folders/pages; compare export sections and exact amounts with the ledger. Interrupt deletion during object removal and Auth deletion, then resume after reauthentication. Include Google challenge expiry, replay and wrong-user browser binding.

**Acceptance:** Exports are complete, RLS-isolated and CSV-safe with no document bytes implied. Retry removes orphaned and indexed files, freezes new writes, finishes identity deletion and removes identifying audit data. No success is shown before all required stages finish.

**Verification / interfaces:** Staging fault-injection and browser evidence with verified cleanup, object counts and redacted results. Keep production fixture rejection; never run this against production.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-012"></a>

## HP-012 — Establish realistic performance and capacity baselines

**Priority:** P1 · **Phase:** 3 · **Status:** open · **Evidence:** unverified realistic measurements
**Area:** Performance · **Responsible role:** Backend + operations + QA · **Estimate:** L
**Dependencies:** HP-005, HP-007; HP-016 staging setup

**Evidence / reproduction:** [Performance plan](../docs/PERFORMANCE.md), [fixture test](../tests/e2e/performance.spec.ts), [service timing](../lib/performance/service-timing.ts). Historical empty-database plans are not a representative baseline.

**Impact:** The full-history reads and export/deletion work may exceed latency, memory or platform timeout budgets as accounts grow.

**Implementation:** Run the documented medium and large profiles; collect at least 30 cold/warm requests per required route plus service p50/p95. Measure export payload/memory and deletion duration. Use query plans before changing indexes; evaluate grouped SQL past 20,000 analytics rows and cursors when deep-page use warrants it.

**Acceptance:** Record counts, deployed SHA, resource limits and p50/p95; investigate service p95 above the existing 750 ms threshold. Explain deviations and demonstrate fixes on the same data. Keep complete totals and privacy-safe timing fields.

**Verification / interfaces:** Existing staging performance commands plus controlled process restart and server logs. Browser navigation timing must not be reported as service latency.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-013"></a>

## HP-013 — Make admin metrics complete and failures visible

**Priority:** P1 · **Phase:** 3 · **Status:** open · **Evidence:** confirmed unpaginated aggregation and ignored error responses
**Area:** Administration/observability · **Responsible role:** Backend + frontend · **Estimate:** M
**Dependencies:** HP-008

**Evidence / reproduction:** [Admin overview](../services/admin.service.ts) derives totals from unpaginated profile/job/notification reads and treats missing data as empty. Returned Supabase errors need not throw into the fallback wrapper.

**Impact:** Operators can see capped counts or reassuring zeros during a backend failure, making incident decisions unreliable.

**Implementation:** Use exact aggregate queries/RPCs for totals and define the recent-job interval explicitly instead of implying all recent failures from only 50 rows. Return unavailable/stale states separately from real zero and retain safe operational fields only.

**Acceptance:** Fixtures beyond the REST cap yield exact totals. Injected query failure displays unavailable with a support correlation signal, not zero healthy activity. Admin privacy assertions continue to pass.

**Verification / interfaces:** Database/service boundary tests at 1,001+ rows, error-response tests and admin browser checks. Introduce a discriminated availability result for widgets where needed.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-014"></a>

## HP-014 — Reconcile docs and streamline maintainability

**Priority:** P2 · **Phase:** 3 · **Status:** open · **Evidence:** confirmed stale comments and runtime mismatch
**Area:** Developer workflow · **Responsible role:** Maintainer · **Estimate:** M
**Dependencies:** Relevant Phase 1 changes settled

**Evidence / reproduction:** [README](../README.md), [old checklist](../docs/PROJECT-AUDIT-CHECKLIST.md), [payment action](../app/actions/obligations.ts), [Vitest config](../vitest.config.ts), [readiness record](../docs/LAUNCH-IMPLEMENTATION.md). Local default runtime was Node 20 despite .nvmrc=22.

**Impact:** Conflicting guidance causes mistaken regressions and overstates readiness.

**Implementation:** Update current behavior comments, distinguish historical records from release evidence, document Node activation and public build versus privileged runtime requirements. Consolidate repeated action field-error mapping only when touched by functional work; retain existing service architecture. Review formatting drift separately from fixes.

**Acceptance:** One current readiness entrypoint links dated evidence; no two-step payment or untestable-service claim remains in current guidance. Normal documented commands use Node 22 and clearly label live/mutating commands.

**Verification / interfaces:** Documentation/link review, runtime guard, affected unit tests and focused formatting checks; do not blanket-reformat the repository.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-015"></a>

## HP-015 — Review headers and rate-limit deployment assumptions

**Priority:** P2 · **Phase:** 3 · **Status:** open · **Evidence:** confirmed implementation assumptions; origin enforcement unverified
**Area:** Security hardening · **Responsible role:** Security + operations · **Estimate:** M
**Dependencies:** HP-001; HP-016 hosting inspection

**Evidence / reproduction:** [Next config](../next.config.mjs), [rate limiter](../services/rate-limit.service.ts), [CSP notes](../docs/CSP-NOTES.md). CSP permits inline script; client-IP selection trusts forwarded headers and limiter errors fail open.

**Impact:** These controls depend on hosting configuration and should not be described as stronger guarantees than they provide.

**Implementation:** Verify origin ingress restrictions and trusted proxy header rewriting. Document fail-open abuse policy and alerts. Evaluate nonce/hash CSP with the installed Next guide; test forms, theme bootstrap and deferred third-party origins. Review actual Permissions-Policy browser behavior instead of trusting historical comments.

**Acceptance:** Spoofed direct-origin forwarding headers do not bypass intended abuse limits, or residual risk and mitigations are recorded. Header changes preserve working hydration/auth and produce no new CSP violations.

**Verification / interfaces:** Controlled staging requests and browser CSP reports; preserve and review the existing rate-limit change rather than overwrite it. Escalate exposed origin bypass to P1 if demonstrated.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-016"></a>

## HP-016 — Provision isolated staging and verify the release platform

**Priority:** P1 · **Phase:** 4 · **Status:** blocked · **Evidence:** unverified current external configuration
**Area:** CI/CD/platform · **Responsible role:** Release engineer · **Estimate:** L
**Dependencies:** External project identities and hosting access; final promotion depends on Phase 1–3 P1 tasks

**Evidence / reproduction:** [Release workflow](../.github/workflows/release.yml), [deployment runbook](../docs/DEPLOYMENT.md), [release CLI](../scripts/release.mjs), [historical readiness](../docs/LAUNCH-IMPLEMENTATION.md). Companion platform work and past PR/CI results do not establish the current live version.

**Impact:** Without isolated staging, the critical hosted tests cannot safely run; production promotion needs evidence for the exact artifact.

**Implementation:** Provision/verify distinct test and production project identities, environment-scoped secrets and deployment hooks. Verify online HelloDeploy compatibility, BuildKit build, Alpine Sharp, routing, readiness and rollback. Execute staging at a full SHA, retain migration hashes and verify promotion checks against that artifact.

**Acceptance:** Wrong target/SHA, missing evidence and failed tests prevent promotion. Staging report identifies app URL/project/SHA without secrets, shows hosted integration/browser passes and records rollback. Production remains unpromoted until other gates close.

**Verification / interfaces:** Run the documented release workflow only when the environment is prepared; attach deployment and test artifacts. This audit did not run deployment or migration commands.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-017"></a>

## HP-017 — Verify signup closure, email, OAuth and public production routing

**Priority:** P1 · **Phase:** 4 · **Status:** blocked · **Evidence:** unverified external gate; signup action exists
**Area:** Auth/launch · **Responsible role:** Operations + backend + QA · **Estimate:** M
**Dependencies:** HP-016 setup; HP-008

**Evidence / reproduction:** [Auth actions](../app/actions/auth.ts), [callback](../app/auth/callback/route.ts), [email setup](../docs/EMAIL-SETUP.md), [launch record](../docs/LAUNCH-IMPLEMENTATION.md). Public registration is implemented; the live Supabase signup setting was not inspected.

**Impact:** Prelaunch users could register before support, recovery or email are ready if the external gate is not actually closed.

**Implementation:** Verify Supabase signup closure until release approval; document its exact opening step. Configure sender/domain and enabled OAuth callback allowlists. Test delivered signup/reset, expired/replayed links, login/logout and disabled status. Verify production DNS/TLS/canonical URL and support replies.

**Acceptance:** Prelaunch signup attempts are refused by an enforced backend setting. Controlled launch test identities receive working email; only expected redirect origins are accepted; provider round trips and support delivery succeed. Attach dates and redacted evidence.

**Verification / interfaces:** Staging and controlled release smoke checks, not placeholder browser rendering. Do not infer delivered email from an API success response.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-018"></a>

## HP-018 — Complete a database and document restore drill

**Priority:** P1 · **Phase:** 4 · **Status:** blocked · **Evidence:** unverified external recovery gate
**Area:** Backup/recovery · **Responsible role:** Database + operations · **Estimate:** L
**Dependencies:** HP-016 isolated restore target

**Evidence / reproduction:** [Restore verifier](../scripts/verify-restore.mjs), [launch checklist](../docs/LAUNCH-CHECKLIST.md), [deployment runbook](../docs/DEPLOYMENT.md). No restore was performed in this audit.

**Impact:** A backup configuration alone does not prove that users can recover balances and original files.

**Implementation:** Restore a dated database backup and corresponding document bytes into an isolated target. Validate migration inventory, RLS/grants, row counts, exact balances and object checksums; measure recovery time and recovery point. Document responsible role, frequency and any missing retention coverage.

**Acceptance:** Restored user A cannot access user B, finance totals reconcile, signed document downloads match original checksums, and measured RTO/RPO are recorded and accepted by the release owner.

**Verification / interfaces:** Use the existing guarded restore procedure with source/target identity proof. Never restore over production as a test; link redacted evidence in the release record.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-019"></a>

## HP-019 — Establish monitoring, scheduler and support ownership

**Priority:** P1 · **Phase:** 4 · **Status:** blocked · **Evidence:** unverified external operations gate
**Area:** Operations · **Responsible role:** Operations + support · **Estimate:** M
**Dependencies:** HP-013, HP-016

**Evidence / reproduction:** [Monitor workflow](../.github/workflows/monitor.yml), [monitor script](../scripts/monitor-launch.mjs), [support runbook](../docs/SUPPORT-RUNBOOK.md). Monitoring is variable-gated; its secrets/URL context differs from environment-scoped release configuration.

**Impact:** A scheduled workflow or cron row is not evidence that failures are detected and acted on.

**Implementation:** Assign primary/backup responders; verify monitor configuration selects production intentionally and receives required secrets. Verify expected cron schedules and recent successful runs. Induce a safe readiness/job failure, confirm notification and acknowledgment, and document hosting error-rate alerts, retention and incident actions.

**Acceptance:** A dated induced alert reaches the named responder within the agreed response target; cron failures and stale runs are visible; sensitive fields are absent from logs. Provider flags remain off and monitoring is demonstrably enabled.

**Verification / interfaces:** Operational read checks plus controlled staging failure exercise; production alert smoke per runbook. Record whether repository or environment secrets supply each monitor input.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-020"></a>

## HP-020 — Qualify OCR and AI before provider activation

**Priority:** P3 · **Phase:** 5 · **Status:** deferred · **Evidence:** confirmed implementations; live readiness unverified
**Area:** OCR/assistant · **Responsible role:** Backend + product + QA · **Estimate:** L
**Dependencies:** HP-003, HP-005, HP-008, HP-019

**Evidence / reproduction:** [OCR service](../services/ocr.service.ts), [assistant service](../services/ai-assistant.service.ts), [usage service](../services/usage.service.ts), [provider tests](../lib/ai/claude-provider.test.ts). Providers and quotas exist but were not called.

**Impact:** Activation adds cost, sensitive-document processing and model failure modes beyond free tracking.

**Implementation:** Exercise sandbox calls, cancellation/timeouts, malformed responses, prompt injection and unsupported inputs. Verify quota enforcement under concurrent calls; add atomic reservation if check-then-record oversubscribes. Preserve explicit human confirmation for OCR and grounded read-only assistant answers. Validate limits, retention, consent and cost monitoring before rollout.

**Acceptance:** Disabled requests never call providers; concurrency cannot exceed the defined quota; failures release reservations consistently. AI cannot mutate records or disclose another user. OCR confirmation passes HP-003, and staged enable/disable rollback works.

**Verification / interfaces:** Provider contract tests, isolated live integration and cost/error dashboards; separately approve activation after free-launch stability. Any new reservation RPC requires a reviewed migration.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-021"></a>

## HP-021 — Qualify push delivery and device lifecycle

**Priority:** P3 · **Phase:** 5 · **Status:** deferred · **Evidence:** confirmed default-off gate; device delivery unverified
**Area:** Notifications/PWA · **Responsible role:** Backend + frontend + operations · **Estimate:** L
**Dependencies:** HP-019, HP-024

**Evidence / reproduction:** [Push delivery](../services/push-delivery.service.ts), [scheduler route](../app/api/scheduler/route.ts), [service worker](../public/sw.js), [notification rules](../lib/notifications/rules.ts).

**Impact:** In-app reminders can work while device delivery remains unconfigured; enabling push without device evidence creates false expectations.

**Implementation:** Configure VAPID and scheduler authentication, verify secret comparison using a standard constant-time primitive, and test permission denial/revocation, stale subscriptions, quiet hours/timezones, deduplication, retries and logout/deletion cleanup. Restrict notification navigation to approved same-origin destinations.

**Acceptance:** Supported real devices receive only permitted reminders; no private financial details appear on the lock screen beyond the agreed policy; expired subscriptions are retired; disabled flag prevents dispatch; clicks land safely after reauthentication.

**Verification / interfaces:** Scheduler auth tests, device/browser matrix and staging delivery/cleanup evidence. Keep the service worker free of private offline caching.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-022"></a>

## HP-022 — Implement and qualify a billing provider

**Priority:** P3 · **Phase:** 5 · **Status:** deferred · **Evidence:** confirmed no-op adapter; provider choice not made
**Area:** Billing/premium · **Responsible role:** Backend + product + operations · **Estimate:** L
**Dependencies:** HP-011, HP-019; separate provider selection

**Evidence / reproduction:** [Billing interface](../lib/billing/provider.ts), [webhook](../app/api/billing/webhook/route.ts), [lifecycle](../lib/billing/lifecycle.ts), [webhook service](../services/billing-webhook.service.ts). Default provider is non-live and refuses unverified events.

**Impact:** The foundation does not support real purchases until an adapter, operational configuration and lifecycle evidence exist.

**Implementation:** Select a provider in a separate product decision, implement its existing interface and raw-body signature verification, and test checkout, redelivery, concurrent duplicates, out-of-order events, grace/cancel/refund states and deletion-time cancellation. Keep entitlements server-enforced and default-free on uncertainty.

**Acceptance:** Sandbox lifecycle reconciles with provider records; repeated events cannot duplicate charges/entitlements; cancellation failure prevents misleading completed deletion; kill switch and rollback retain accurate subscriber state.

**Verification / interfaces:** Provider sandbox, webhook signature/replay integration, entitlement regression and support runbook. No billing activation or provider-specific schema is authorized by this documentation task.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-023"></a>

## HP-023 — Qualify advertising and consent independently

**Priority:** P3 · **Phase:** 5 · **Status:** deferred · **Evidence:** confirmed eligibility/consent foundation; live behavior unverified
**Area:** Advertising/privacy · **Responsible role:** Frontend + product + privacy reviewer · **Estimate:** M
**Dependencies:** HP-015, HP-019, HP-024

**Evidence / reproduction:** [Ad eligibility](../lib/ads/eligibility.ts), [ad context](../lib/ads/server.ts), [consent banner](../components/consent/consent-banner.tsx), [ads.txt](../public/ads.txt).

**Impact:** Third-party requests and consent transitions require separate verification before monetization is introduced.

**Implementation:** Verify publisher configuration, eligible public placements and ads.txt; exercise reject/accept/change/revoke consent and page navigation. Ensure premium eligibility where applicable, keep financial/auth/admin screens ad-free, and measure layout shift. Obtain content/privacy review for the actual vendor configuration.

**Acceptance:** No ad script or request occurs when consent/config/flag forbids it; consent changes take effect predictably; protected screens remain ad-free; placement and layout stability are verified.

**Verification / interfaces:** Network-observing browser tests and policy review. This is a readiness requirement, not a legal compliance certification.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-024"></a>

## HP-024 — Broaden public-site and PWA quality coverage

**Priority:** P2 · **Phase:** 3 · **Status:** open · **Evidence:** confirmed limited current coverage and observed layout tradeoffs
**Area:** Public UX/SEO/PWA · **Responsible role:** Frontend + QA · **Estimate:** M
**Dependencies:** HP-009 public checks; HP-016 for deployed canonical checks

**Evidence / reproduction:** [Public tests](../tests/e2e/public.spec.ts), [SEO registry](../lib/seo/routes.ts), [sitemap](../app/sitemap.ts), [manifest](../app/manifest.ts), [header](../components/layout/site-header.tsx). Screenshot review shows navigation wrapping at 375/768px and a fixed consent banner occupying substantial phone viewport space.

**Impact:** Public tests do not cover all pages or full theme/device behavior. Wrapped navigation and consent placement deserve usability review despite passing overflow checks.

**Implementation:** Add about/help/terms/guides/detail/error coverage, full theme and keyboard checks, 200% zoom and banner dismissal/focus checks. Refine header grouping only if needed to preserve content access; retain adequate targets. Verify deployed canonical/sitemap/noindex, social assets, manifest icons and install behavior. Add explicit offline messaging without caching finance responses.

**Acceptance:** All public routes and guide links work, metadata reflects deployed origin, private routes remain noindex, install/start URL respects auth, and no content/control becomes unreachable under banner/zoom. Navigation has a clear reading order at all target widths.

**Verification / interfaces:** Playwright coverage plus real-device install and Safari/Firefox smoke checks. Review screenshots; do not equate zero axe violations with a completed visual or accessibility audit.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-025"></a>

## HP-025 — Make the financial freeze comprehensive and explicit

**Priority:** P1 · **Phase:** 1 · **Status:** in progress · **Evidence:** confirmed missing entrypoint checks and contradictory failure comment
**Area:** Incident controls/ledger · **Responsible role:** Backend + database · **Estimate:** M
**Dependencies:** None

**Evidence / reproduction:** [Kill switch](../lib/ops/kill-switches.ts), [flag reader](../services/plan.service.ts), [recurring actions](../app/actions/recurring.ts), [extraction actions](../app/actions/extraction.ts), [forecast lazy generation](../services/forecast.service.ts). Finance/obligation actions enforce the switch; recurring and extraction paths do not.

**Impact:** The documented incident freeze can still permit new financial obligations or linked records through alternate paths. Normal flag-read failures deny writes, contrary to the fail-open comment.

**Implementation:** Define the freeze as blocking financial record creation/change, including recurring-generated obligations and extraction confirmation. Enforce it at shared mutation/RPC boundaries and scheduled generation paths, with reads/export/deletion recovery available. Use explicit fail-closed behavior on unreadable financial-write flag and accurate user-facing messaging.

**Acceptance:** With the flag false or unreadable, every identified financial mutation and scheduled generator makes zero ledger/obligation changes; reads remain usable. Tests cover on/off/read failure and alternate entrypoints, not only a mocked throwing flag reader.

**Verification / interfaces:** Action/service and database/job tests plus staging operational exercise. Preserve provider flag defaults; document the chosen outage policy and any internal RPC changes.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.

<a id="hp-026"></a>

## HP-026 — Make privileged administrative changes durably auditable

**Priority:** P1 · **Phase:** 1 · **Status:** in progress · **Evidence:** confirmed best-effort audit boundary; lost-audit incident not observed
**Area:** Admin/security audit · **Responsible role:** Backend + database · **Estimate:** M
**Dependencies:** HP-008

**Evidence / reproduction:** [Admin wrapper](../lib/auth/admin.ts) runs the mutation before [audit helper](../lib/auth/audit.ts), which intentionally catches audit failures. [Admin actions](../app/actions/admin.ts) rely on the wrapper for reasons and authorization.

**Impact:** A role/status/entitlement or repair change can succeed without its required reason/audit record if the subsequent audit insert fails.

**Implementation:** For privileged database mutations, write the state change and audit event in one transaction/RPC; retain best-effort auth telemetry separately. Return truthful partial-outcome handling for any external operation that cannot share the transaction. Avoid adding private financial content to operational logs.

**Acceptance:** Injected audit failure rolls back privileged state changes; successful changes retain actor, target, reason and correlation. Unauthorized/self-target changes remain refused, and deletion audit erasure behavior still passes.

**Verification / interfaces:** Isolated rollback tests and action integration; review grants for new RPCs and data minimization. Existing role/status input contracts should remain compatible.

- [ ] Implementation or required investigation completed.
- [ ] Acceptance evidence linked with date, commit and environment.
