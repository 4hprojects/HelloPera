# Validation and evidence

## Audit identity and boundaries

Date: **1 October 2026**, Asia/Manila. Baseline commit: `d3b03ad1937dbbcf82aa30e6a75daa6971d43273`. The existing rate-limit modification was included in the inspected source and temporary build copy and was preserved byte-for-byte. Documentation files are the only additions from this audit.

The default shell ran Node 20.20.2. All execution checks below explicitly selected **Node 22.23.1** from the installed nvm version. Dependencies were already installed. No application code, dependency version, migration, flag, live data or deployment was changed.

Build/browser work used `/tmp/hellopera-audit-vxrr_633`, a copy of tracked files with current working-tree contents, excluding `.env*`, with a local dependency copy. Supabase URL/key and application URL were placeholders; the server key was an unmistakably fake audit placeholder. Real environment files were not copied or printed. Temporary build/browser artifacts are local diagnostics, not durable release evidence.

## Executed checks

| Check                       | Command / method                                                                                   | Result                                                        | Limitation                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Runtime                     | `npm run check:node` with Node 22 PATH                                                             | Passed, 22.23.1                                               | Default interactive shell still needs version selection                                          |
| Types                       | `npm run typecheck`                                                                                | Passed                                                        | Static contracts do not validate JSON runtime types                                              |
| Lint                        | `npm run lint`                                                                                     | Passed                                                        | Not a security or accessibility proof                                                            |
| Unit/operational regression | `npm test`                                                                                         | **57 files, 765 tests passed**; reported duration 45.04 s     | Live integration excluded by script                                                              |
| Isolated database           | `npm run test:db`                                                                                  | Passed all six reported behavior groups and all 28 migrations | Minimal platform schema; no hosted HTTP, real Storage/Auth, cron or parallel hosted transactions |
| Production build            | `npm run build` in isolated copy                                                                   | Passed; compilation 83 s, TypeScript 40 s                     | Local Linux runtime, not Alpine hosting                                                          |
| Public browser              | `npm run test:e2e` against isolated standalone artifact                                            | **9 passed**, approximately 1.2 min                           | Chromium at three viewports; public subset only                                                  |
| Visual review               | Viewed `features-375.png`, `features-768.png`, `features-1280.png`                                 | Screenshots inspected; observations below                     | One light-theme public page, not a private-screen visual audit                                   |
| Production dependency audit | `npm audit --omit=dev --json`                                                                      | Exit 1: **one critical finding**, direct dependency Next      | Dependency finding; application exploit not demonstrated; see HP-001                             |
| Input contract probe        | Transpiled existing schema, passed grouped amount and impossible date                              | Both accepted unchanged                                       | Isolated validation proof, not browser submission                                                |
| Numeric SQL/JSON probe      | PGlite numeric parameter and JSONB result                                                          | Grouped amount rejected; uncast numeric JSON lost precision   | Hosted PostgREST boundary needs regression coverage                                              |
| Documentation integrity     | Local paths, fragment links, canonical task IDs, phase assignments and focused Markdown formatting | Verified after document creation                              | External release evidence remains pending                                                        |
| Scope preservation          | Git diff plus comparison with temporary baseline rate-limit file                                   | Only `to do/` added; original rate-limit file preserved       | No commit created                                                                                |

An initial temporary build failed because a `node_modules` symlink pointed outside Turbopack's root. Replacing it with a local dependency copy allowed the unmodified application to build. This was a test-harness problem, not an application build defect. Public pricing requests logged expected lookup failures against the placeholder Supabase endpoint; the browser checks passed using the fallback catalog. That verifies fallback rendering, not real catalog connectivity.

Local diagnostic paths from this run:

- `/tmp/hellopera-audit-build.log`
- `/tmp/hellopera-audit-browser.log`
- `/tmp/hellopera-audit-dependencies.json`
- `/tmp/hellopera-audit-vxrr_633/test-results/`
- `/tmp/hellopera-audit-vxrr_633/playwright-report/`

These paths may disappear with temporary-directory cleanup. The checked-in report records the results; future releases must retain their own CI evidence artifacts rather than rely on these local files.

## Database behavior actually executed

The existing [database runner](../scripts/test-database.mjs) uses [minimal platform bootstrap SQL](../tests/database/bootstrap.sql) with PGlite and reports:

1. All migrations execute on isolated PostgreSQL; the latest migration group is reapplied for replay checks.
2. Receivable and expected-income settlement works.
3. Payment retries, changed-payload refusal, rollback and cross-user rejection work.
4. Settlement, recurring fulfillment validation, void/reopen and balance behavior work.
5. Complete snapshot export, RLS isolation, exact exported decimal strings and selected RPC execute grants work, including more than 1,000 obligations.
6. Deletion challenge expiry/replay, financial/storage write freeze, cascade and identifying audit erasure work.

The unit suite includes pure recurrence/finance/forecast/analytics logic, schema/auth guards, provider contracts, flags, logs, CSV safety, upload/deletion failure mocks and release-target/CLI regression tests. SQL-parity tests compare source/logic; they should not be mistaken for independent execution of every hosted database function.

## Coverage matrix

| Scenario                          | Evidence available now                                                                   | Required follow-up                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Obligation payment retry/rollback | Isolated database checks; staging concurrency tests exist                                | Execute concurrent hosted tests at release SHA, HP-008/HP-016                        |
| Ordinary transaction replay       | No request-key contract in inspected source                                              | HP-006 implementation and regression                                                 |
| Transfer accounting               | Pure balance tests and RPC inspection                                                    | Hosted same-currency/cross-currency browser journeys, HP-009                         |
| Void/correction                   | Database void/reopen cases; staged browser path exists                                   | Full private browser run and refreshed totals, HP-009                                |
| Cross-user access                 | Selected RLS/RPC tests and guard unit tests                                              | Full action/API/storage matrix including suspended owners, HP-002/HP-008             |
| Upload validation and cleanup     | Byte-validation unit tests, upload failure mocks                                         | Actual codecs, sizes, signed/private object access and retries, HP-010/HP-011/HP-016 |
| Export                            | Snapshot/grants/exact-text DB checks; CSV helper tests                                   | HTTP export at representative size and concurrent activity, HP-011                   |
| Deletion                          | Mocked failure/retry and isolated freeze/cascade                                         | Real multi-page bucket, Google round trip and interrupted hosted deletion, HP-011    |
| Disabled providers                | Gate source and provider-flag tests                                                      | Reachable action denial plus zero provider calls, HP-003/HP-020                      |
| Analytics completeness            | Pure aggregate tests and paginated source                                                | Concurrent snapshot and numeric wire tests, HP-005/HP-007                            |
| Public accessibility              | Eight routes in default theme, Features in dark theme, login keyboard and header targets | Full route/theme/zoom/device and manual checks, HP-009/HP-024                        |
| Admin operations                  | Privacy/source tests, guarded pages/actions inspected                                    | Complete counts, failure states and atomic audit evidence, HP-013/HP-026             |
| Scheduling                        | SQL and scheduler source inspected                                                       | Live schedules, successful execution and alert drill, HP-019                         |
| Performance                       | Existing measurement harness inspected                                                   | Medium/large hosted runs; no current latency baseline, HP-012                        |
| Release/recovery                  | Local release guard tests                                                                | Hosted platform, exact-SHA staging, restore and rollback, HP-016–HP-019              |

## Public browser and visual observations

The existing suite visits `/`, `/features`, `/pricing`, `/faq`, `/privacy`, `/contact`, `/login` and `/register`. It checks HTTP success, an h1, CSP presence/violations, axe WCAG 2/2.1 tags and horizontal overflow. Separate tests check login labels/keyboard focus and Features dark-theme accessibility with header targets at least 44 px tall. Three tests across phone/tablet/desktop produce nine results; this is not nine distinct workflows.

Viewed Features screenshots show consistent Jade branding, clear availability badges, readable card content and a two-column tablet/desktop versus one-column phone layout. At 375 px the header spans several rows; at 768 px navigation wraps. The fixed consent banner occupies substantial phone viewport space and overlays some content in a full-page capture. The capture alone does not prove that content is unreachable: scroll, dismissal, focus and zoom behavior need HP-024 verification. No authenticated screenshots were captured or inspected.

## Reproducible local commands

From the repository, activate the required runtime and run the inspected local checks:

```sh
nvm use
npm run check:node
npm run typecheck
npm run lint
npm test
npm run test:db
npm audit --omit=dev --json
```

For build/browser verification, first prepare a disposable copy of tracked source using current file contents, excluding `.env*`, with its own dependency directory. Do not symlink dependencies outside Turbopack's project root. In that copy, with provider secrets absent:

```sh
export NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ci_placeholder
export NEXT_PUBLIC_APP_URL=http://localhost:3030
export SUPABASE_SECRET_KEY=sb_secret_audit_placeholder
npm run build
npm run test:e2e
```

The browser starter copies static assets into the standalone artifact and launches port 3030. Ensure an unrelated server is not already using that port; the current Playwright config allows reuse outside CI. No existing server was reused for this audit's temporary build run.

Do not substitute `preflight`, key checks, operations checks or staging runners indiscriminately: several commands use environment configuration and may contact real services. Inspect each script and verify its target first.

### Isolated input and transport probe

This reproduces the audit's additional observations without changing tracked files or contacting a database server. Run under Node 22 from the repository. The small loader transpiles the existing schema and its local dependencies; it does not replace them with a reimplementation.

```js
// Run with: node <<'JS' ...this block... JS
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const localRequire = (id) => {
    if (!id.startsWith('@/')) return require(id);
    const base = path.resolve(id.slice(2));
    return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}/index.ts`);
  };
  new Function('require', 'module', 'exports', js)(localRequire, module, module.exports);
  return module.exports;
}
const { createTransactionSchema } = load('schemas/finance.schema.ts');
console.log(
  createTransactionSchema.safeParse({
    type: 'income',
    amount: '1,234.56',
    transactionDate: '2026-02-31',
    destinationAccountId: '11111111-1111-4111-8111-111111111111',
  }),
);
const { PGlite } = require('@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    try {
      await db.query('select $1::numeric', ['1,234.56']);
    } catch (error) {
      console.log('Grouped amount cast:', error.code);
    }
    console.log(
      (
        await db.query(`
      select jsonb_build_object('amount', 9999999999999999.99::numeric(18,2)) as raw,
             jsonb_build_object('amount', 9999999999999999.99::numeric(18,2)::text) as exact
    `)
      ).rows,
    );
  } finally {
    await db.close();
  }
})();
```

Observed: schema success with unchanged amount/date; cast error `22P02`; raw JSON amount `10000000000000000` versus exact text `9999999999999999.99`. The installed PostgREST client uses `JSON.parse(body)`. These observations justify HP-004/HP-005; they do not establish how many real user records, if any, have encountered these boundaries.

## Checks deliberately not performed

No live integration fixtures, hosted performance runs, operations/key validation, migration application, restore, DNS/TLS probes, email sends, OAuth login, provider calls, production promotion or monitor activation were performed. No current secret/configuration inventory was collected. These remain explicitly unverified external gates, not failed local tests.

Future evidence rows should include: task ID, commit SHA, timestamp, environment identity, command or manual steps, expected/actual outcome, redacted artifact link, owner and any remaining limitation. A screenshot or green local build alone cannot close a hosted release gate.

## Phase 1 local implementation run — 2026-10-04

Environment: local, Node 22.23.1, uncommitted working tree on `feat/hellodeploy-release-readiness` (base d3b03ad). No hosted staging evidence yet.

| Check | Result |
| ----- | ------ |
| `npm run typecheck`, `npm run lint` | Pass |
| `npm test` | 57 files / 767 tests pass (Node 20 fails `proxy.test.ts`; Node 22 required) |
| `npm run test:db` | Pass, including new cases: idempotent account/transaction replay and mismatch rejection, RLS-scoped bounded analytics snapshot (single statement), recurring generation fail-closed |
| `npm audit --omit=dev` after Next 16.3.5 → 16.3.8 (+ eslint-config-next) | 0 vulnerabilities; no `next/og` usage |
| `npm run build` | Pass |

Status: HP-001–HP-007 and HP-025 are **in progress**: implemented and locally verified, awaiting hosted staging evidence and committed SHA. HP-008 (full authorization matrix) and HP-026 (transactional privileged audit) remain open.

## Phase 1 — HP-008 / HP-026 local implementation — 2026-10-04

Environment: local, Node 22.23.1, on top of commit 82f1a30. Hosted staging evidence still outstanding.

- HP-026: migration `20261004000200_admin_atomic_audit.sql` adds service-only `admin_apply_change`, which applies the privileged change and its audit row in one transaction and re-validates active admin, reason and self-target. `adminAction` now calls it; the separate best-effort audit write and the non-atomic service mutations were removed. `npm run test:db` proves: injected audit failure rolls the change back; self-target, non-admin, suspended-admin and short-reason requests are refused; `authenticated` cannot call the function. This also fixes feature-flag audit rows, which previously passed a non-uuid key as `entity_id` and were silently lost.
- HP-008: `lib/auth/entrypoint-matrix.test.ts` enumerates every server action and route handler and fails if one lacks a declared, source-verified boundary. It found and fixed `updateProfile` (session only; suspended/disabled/unverified accounts could write via the admin client — now `requireUser`). `GET /api/export` now returns 401/403 JSON instead of redirecting. Still outstanding for HP-008: two-user RLS/direct-write cases against hosted Auth/Storage/PostgREST (needs HP-016).
- Checks: typecheck, lint, 820 unit tests, 10 isolated DB test blocks, build all pass.

## Phase 2 — HP-009 currency selection and date default — 2026-10-04

Local, Node 22.23.1. `createTransactionAction` now derives currency from the selected account(s) via `lib/finance/currency.ts` and ignores the browser value; cross-currency and same-account transfers are refused with a clear message. The form shows the derived currency, filters transfer destinations to same-currency accounts, clears stale destinations, and defaults the date from the profile timezone (`todayInTimezone`, tested around local midnight). Typecheck, lint, 827 unit tests pass. **Outstanding for HP-009:** browser journeys (expense, transfer, collection, recurrence, correction), keyboard/screen-reader/WCAG checks, and a PHP-profile user transacting in a USD account on staging.
