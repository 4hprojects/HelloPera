# Deployment readiness record — 25 September 2026

**Public launch: not yet verified.** This record supersedes historical phase status
and the previous checklist. Deployment steps and exact settings live in
[DEPLOYMENT.md](DEPLOYMENT.md).

## Scope and implementation

Free finance tracker and document storage, with automatic staging and manual
production promotion. Provider features stay disabled. Changes span HelloPera and
the sibling HelloDeploy repository; neither repository's local changes establish
that the online platform or application has been deployed.

Implemented: Auth-independent health probes, request-time bounded pricing reads,
public secret-key rejection, read-only migration status, production fixture-target
rejection, exact-SHA release workflows and status polling, staging evidence checks,
migration hashes and post-release smoke checks. HelloDeploy supplies public build
snapshots, branch-validated hook SHAs, scoped status API, and matching rollback
configuration. Production promotion requires explicit launch-gate confirmation.

The pre-existing change to `services/rate-limit.service.ts` is preserved.

## Evidence collected

Before implementation, Node 22 typecheck/lint, 751 unit tests, isolated database
tests, production build and nine browser checks passed. The build logged a failed
pricing lookup; request-time pricing removes that build dependency.

Read-only checks against the locally configured database found all 28 migration
identifiers recorded, six expected cron jobs active, one active admin, and disabled
push, AI/OCR, billing/premium and advertising. These are point-in-time observations,
not evidence that staging isolation, backups or production hosting work.

The dependency audit reported no known production vulnerabilities. HelloDeploy's
public site responded over HTTPS; hellopera.online timed out from this environment.
Docker daemon access was denied, so no Alpine container execution was verified here.

GitHub authentication was restored on 25 September. Created `staging` and
`production` environments, limited deployments to `main`, and configured both app
URLs. Production `LAUNCH_GATES_CONFIRMED` remains `false`. Main now requires the
up-to-date CI quality check, including for administrators, and rejects force pushes
and deletion. Environment secrets await confirmed Supabase identities and deploy hooks.

Remote HelloDeploy main was 118 commits ahead of the original local checkout.
The companion changes were reconciled in a separate worktree against
`0ff887222b32d0298315f03dd9c6d99d00f5ed7c`; the original checkout remains intact.
Platform PRs #45–#48 merged during verification and are incorporated into companion
[PR #49](https://github.com/4hprojects/HelloDeploy/pull/49), in the separate
`HelloDeploy-release` worktree. Build-variable overlap is resolved. This does not
establish which version is on the live host.
The HelloPera draft PR is [#1](https://github.com/4hprojects/HelloPera/pull/1);
GitHub quality CI passed at `8579cc5` on 25 September.

## External gates still open

| Gate | Required evidence |
| --- | --- |
| Platform | Online version includes companion changes; BuildKit build, routing and rollback on supported host |
| Staging | Separate project identity, deployed SHA, authenticated/concurrency tests and release artifact |
| Production | DNS/TLS, canonical URLs, expected active SHA, readiness and auth redirects |
| Email/OAuth | Delivered signup/reset, expired links, support reply and enabled-provider round trips |
| Recovery | Restored database and document bytes, RLS verification and measured recovery time |
| Performance/devices | Medium/large profiles, service p50/p95, phone walkthrough and deletion retry |
| Operations | Named owner, monitoring on, induced alert acknowledged and hosting error-rate alert |

No migrations, deployment hooks, DNS changes, provider activation, live fixture tests,
or production releases were performed as part of local implementation. Keep public
registration closed until these gates have dated evidence. A missing provider adapter
is not a free-launch blocker while its feature remains disabled.

## Final local validation — 25 September 2026

| Check | Result |
| --- | --- |
| HelloPera Node 22 typecheck and lint | Passed |
| HelloPera unit/operational regression tests | 765 passed |
| Isolated PostgreSQL tests | All 28 migrations and behavior checks passed |
| Production build | Passed with placeholder public config and a fake server key; no pricing build lookup |
| Public browser checks | 9 passed on the final standalone build, including pricing |
| Browser bundle secret sentinel scan | No match in `.next/static` |
| Workflow validation | actionlint 1.7.7 passed |
| HelloDeploy current-main suite | 1,022 passed with four test workers, zero skipped |
| HelloDeploy lint / formatting / development configuration | Passed on current-main reconciliation |
| Migration status / operations (read-only) | All 28 recorded; cron/admin/deferred flags passed |

Before integrating the newer startup fixes, the default parallel HelloDeploy test run had 999 passes and one unchanged
fatal-process test exceeding its five-second subprocess timeout. All five process
tests passed in isolation; the full suite passed with four workers. The timeout
was not weakened.

Release CLI regression tests include platform compatibility, wrong target,
identity mismatch, failed deployment, timeout and no duplicate POST after a lost
response. Fixture guards are enforced both in runners and at fixture creation.

Required local configuration remains absent: deploy hook, staging/production test
references, staging app URL, and restore source/target. Do not interpret the local
results as a completed live staging release or production promotion.
