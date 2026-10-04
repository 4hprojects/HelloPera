# HelloPera quality implementation backlog

Audit date: **1 October 2026**. Baseline: `d3b03ad1937dbbcf82aa30e6a75daa6971d43273`, including the pre-existing, uncommitted change to `services/rate-limit.service.ts`.

**Launch readiness remains unverified.** Local checks are useful evidence, but do not establish that the deployed application, email, backups, storage or monitoring work. This folder contains analysis and future implementation tasks; it does not record those tasks as implemented.

## Reading order

| Document                                                                                  | Use                                                                          |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Project analysis](01-project-analysis.md)                                                | Understand the architecture, current capabilities, risks and review coverage |
| [Prioritized backlog](02-prioritized-backlog.md)                                          | Canonical task records, evidence, dependencies and acceptance criteria       |
| [Phase 1: correctness and security](03-phase-1-correctness-and-security.md)               | Close financial and authorization gaps                                       |
| [Phase 2: core flows and accessibility](04-phase-2-core-flows-and-accessibility.md)       | Verify usable, recoverable user journeys                                     |
| [Phase 3: performance and maintainability](05-phase-3-performance-and-maintainability.md) | Establish representative performance and reliable operational data           |
| [Phase 4: launch and operations](06-phase-4-launch-and-operations.md)                     | Collect deployment, recovery and operational evidence                        |
| [Phase 5: deferred capabilities](07-phase-5-deferred-capabilities.md)                     | Enable providers only after their own acceptance gates                       |
| [Validation and evidence](08-validation-and-evidence.md)                                  | Distinguish executed checks from required future verification                |

## Priority and status rules

| Priority | Definition                                                              | Release handling                                                            |
| -------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| P0       | Confirmed release-blocking security, data-loss or core-function failure | Stop release and investigate immediately                                    |
| P1       | Required launch correctness, safety, usability or evidence work         | Complete before public launch                                               |
| P2       | Meaningful improvement with a bounded current impact                    | Schedule after launch blockers; do not silently turn it into a release gate |
| P3       | Intentionally deferred capability                                       | Implement only in a separately approved feature release                     |

No P0 exploit or data-loss incident was reproduced in this audit. A critical dependency advisory is tracked as P1 because the documented vulnerable application usage was not found. Elevate immediately if that usage or a reproducible incident is discovered.

Evidence labels: **confirmed** means code inspection or a local probe establishes the stated fact; **suspected** means the failure scenario needs reproduction; **historically reported** means an older record asserts it; **unverified** means current environmental evidence is absent. A confirmed gap is not automatically a confirmed production incident.

Statuses: open, in progress, blocked, done, deferred. A task becomes done only when its acceptance evidence is attached. Estimates are engineering effort, not calendar commitments: S = up to one day, M = two to three days, L = four to seven days; infrastructure waiting and provider onboarding are additional. Responsible roles are assignments to make, not claims that someone has accepted ownership.

## Progress and dependencies

| Phase | Tasks                         | Current state                | Exit dependency                                                           |
| ----- | ----------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| 1     | HP-001–HP-008, HP-025, HP-026 | Open                         | P1 correctness and authorization criteria pass                            |
| 2     | HP-009–HP-011                 | Open                         | Core flows pass after relevant Phase 1 fixes                              |
| 3     | HP-012–HP-015, HP-024         | Open                         | P1 performance and operations-data gates pass; P2 items may follow launch |
| 4     | HP-016–HP-019                 | Blocked on external evidence | Phase 1/2 gates, Phase 3 P1 gates, staged release and recovery evidence   |
| 5     | HP-020–HP-023                 | Deferred                     | Free launch stable, provider-specific acceptance complete                 |

Start HP-016 staging setup early: it supplies the environment needed by earlier phases. Phase numbers express release order, not a prohibition on preparing infrastructure in parallel. No circular dependency is intended: staging provisioning precedes validation; final production promotion follows it.

## Maintenance contract

- Keep detailed task status and acceptance results in the backlog; phase files reference IDs rather than copy task descriptions.
- Re-run affected checks after implementation and record commit, date, environment, command, result and artifact location in the evidence file.
- Preserve [the existing readiness record](../docs/LAUNCH-IMPLEMENTATION.md) as historical evidence; attach new release evidence before changing its launch verdict.
- Preserve existing work, including the rate-limit modification. Do not paste environment values, account data, signed URLs or secrets into this folder.
- This audit changes no application API, schema, feature flag or deployment. Future interface changes are identified in task records.
