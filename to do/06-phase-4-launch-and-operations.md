# Phase 4 — launch and operations

## Goal and entry requirements

Produce a reviewable release evidence packet proving that the actual hosted application can serve, protect and recover users' data. The source of deployment procedure remains [DEPLOYMENT.md](../docs/DEPLOYMENT.md); the prior state is [LAUNCH-IMPLEMENTATION.md](../docs/LAUNCH-IMPLEMENTATION.md). Neither is proof of today's live configuration.

Start staging preparation immediately. Final promotion requires Phase 1/2 launch criteria and Phase 3 P1 criteria, with provider features still disabled. Do not reuse production as a fixture target.

## Work packages and order

1. [HP-016](02-prioritized-backlog.md#hp-016): establish isolated staging identities/configuration and verify the online platform. This unblocks hosted tests in other phases.
2. [HP-017](02-prioritized-backlog.md#hp-017): prove signup closure, delivered authentication email, OAuth and public origin behavior.
3. [HP-018](02-prioritized-backlog.md#hp-018): restore database and document bytes into a separate target and verify access/integrity.
4. [HP-019](02-prioritized-backlog.md#hp-019): verify scheduler, monitoring, incident response and support ownership.
5. Finish the exact-SHA staging release and promotion evidence. Opening registration and promoting production are explicit release actions, outside this documentation audit.

## Required release evidence packet

| Evidence      | Required contents                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Identity      | Full commit SHA, branch, app origin, test/production project distinction, deployment/build IDs; no keys or hook secrets            |
| Compatibility | Online HelloDeploy version supports the release contract; Alpine Sharp loads; supported formats work; request/body limits observed |
| Migrations    | Migration identifiers and hashes, successful application/verification, ordering and compatibility review                           |
| Application   | Local gates and hosted integration/browser results for the deployed SHA; provider-disabled checks                                  |
| Auth          | Delivered signup/reset, expired/replayed link behavior, OAuth callbacks and account-status denial                                  |
| Recovery      | Backup timestamp, restored DB and object checksums, RLS checks, measured recovery point/time and responsible operator              |
| Performance   | Representative fixture sizes, warm/cold timings, service p50/p95, resource ceilings and accepted exceptions                        |
| Operations    | Monitor and cron evidence, induced alert, responder acknowledgment, support mailbox and escalation route                           |
| Rollback      | Previous known-good image/SHA, routing rollback exercise and data compatibility restrictions                                       |

## Promotion and first-use monitoring

Use the existing manual production promotion gate with successful staging evidence for the exact SHA. Keep `LAUNCH_GATES_CONFIRMED` false until the packet is complete. Confirm that monitoring receives the correct production URL and secret scope independently of release environment configuration.

After an approved promotion, verify readiness, active SHA, DNS/TLS, canonical origin, login/callback behavior and private-route denial before opening signups. Observe errors, service latency, job freshness, storage failures and support contacts during initial use. A known-good application rollback must not blindly reverse database migrations or lose new user data; use the documented incident procedure.

## Exit criteria

- [ ] All four canonical tasks have current evidence and assigned people behind their responsible roles.
- [ ] Exact-SHA staging checks pass; production/test target rejection and promotion evidence checks remain enforced.
- [ ] Restore and alert drills are completed, not merely described.
- [ ] Launch owner explicitly accepts the evidence and performs promotion/open-signup steps through the documented workflow.
- [ ] Provider features remain disabled unless separately qualified under Phase 5.

This audit did not inspect live GitHub secrets, DNS, Supabase settings or platform deployment state. Their absence from this report means unverified, not necessarily misconfigured.
