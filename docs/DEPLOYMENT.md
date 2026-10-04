# HelloPera deployment runbook

Updated 25 September 2026. Launch scope: free tracker and document storage.
AI/OCR, push, billing, premium and ads must remain disabled. Read
[the readiness record](LAUNCH-IMPLEMENTATION.md) before opening registration.

## 1. Upgrade HelloDeploy first

The companion HelloDeploy checkout contains required changes. Review and deploy
that platform release using its supported-host upgrade procedure before enabling
HelloPera automation. Local source is not proof the online worker was upgraded.

The platform must support:

- `POST /api/deploy-hooks/:projectId/:token` with JSON `{ "commitSha": "<40 lowercase hex characters>" }`.
  A supplied SHA must be on the connected project's deployment branch. The old
  no-body hook still uses the tracked latest commit.
- `GET /api/deploy-hooks/:projectId/capabilities` with the same bearer token verifies
  API compatibility, the concurrency index, manual mode and public target configuration
  before migrations. The workflow compares browser configuration fingerprints.
- `GET /api/deploy-hooks/:projectId/deployments/:deploymentId` with
  `Authorization: Bearer <hook token>`. Status includes `deploymentId`, `commitSha`,
  `status`, `active`, `configurationFingerprint`, and a generic failure description.
- Public build configuration snapshots, retained through rollback. Only
  `NEXT_PUBLIC_*` settings enter Docker builds. These values are public by design;
  never put a privileged credential under that prefix.
- Node 22 Alpine, BuildKit, port 3000, `HOSTNAME=0.0.0.0`, and Sharp support.
  The generated dependency-install instruction has network access; the application
  build has none. Do not add build-time provider/database calls.
- The `one_inflight_per_project` partial unique MongoDB index. Verify that it exists
  after upgrade; resolve legacy in-flight records before creating it if necessary.

Test these features on the actual host, including an old-release rollback. Keep
HelloPera automation disabled until the platform tests and host validation pass.
Do not change Docker socket permissions just to make local tests pass.

## 2. Create isolated projects and configure domains

Create two HelloDeploy projects connected to `4hprojects/HelloPera`, branch `main`:

| Setting | Staging | Production |
| --- | --- | --- |
| Domain | staging.hellopera.online | hellopera.online |
| Supabase | Dedicated disposable staging project | Production project |
| Deployment mode | Manual (GitHub invokes hook) | Manual (GitHub invokes hook) |
| Runtime / root | Next.js / repository root | Same |
| Build / port | `npm run build` / 3000 | Same |
| Health path | `/api/health` | Same |

Generate each project's deploy hook. Store the full URL only as a GitHub secret.
Complete HelloDeploy domain verification and DNS/TLS. Redirect `www.hellopera.online`
to `https://hellopera.online`. If Cloudflare is used, use Full (strict) with a valid
origin certificate, avoid caching authenticated/API responses, and restrict origin
access so forwarded client-IP headers cannot be forged through direct access.
Do not put a browser challenge in front of health checks or the deploy-hook API.

Set these HelloDeploy environment entries separately for each project:

| Name | Value / timing |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | That environment's API URL; build and runtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key; build and runtime |
| `NEXT_PUBLIC_APP_URL` | Exact HTTPS origin above; build and runtime |
| `NEXT_PUBLIC_APP_NAME` | `HelloPera`; build and runtime |
| `SUPABASE_SECRET_KEY` | That environment's privileged key; runtime only |
| `HOSTNAME` | `0.0.0.0` (platform also enforces this for Next.js) |

Leave optional provider settings absent. Changing public configuration requires a
new build; restarting an existing image cannot change its browser configuration.
Runtime secrets can rotate on redeploy; rollback uses current runtime secrets and
the old image's public snapshot. Keep database changes backward compatible.

## 3. GitHub configuration

Environments **staging** and **production** are configured and restricted to `main`.
Their `APP_URL` values are set. Main requires the up-to-date CI quality job;
force pushes and deletion are blocked. Production promotion remains manual, with
`LAUNCH_GATES_CONFIRMED=false` until the external gates pass. Additional reviewer
requirements can be configured if the team needs them.

In **each environment**, create these secrets:

- `HELLODEPLOY_HOOK_URL`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`
- `DATABASE_URL`: pooled PostgreSQL URI; username must be `postgres.<project-ref>`.
  The release script rejects an API/database project mismatch before migrations.

In **each environment**, create these variables:

- `APP_URL`: exact origin from the table above, without a trailing slash.
- `SUPABASE_PROJECT_REF`: that environment's project ref.
- `PRODUCTION_SUPABASE_PROJECT_REF`: the production ref in both environments.

Production also requires `LAUNCH_GATES_CONFIRMED=true`, set only after the external
launch gates below have dated evidence. Do not store `DATABASE_URL` in HelloDeploy.

Repository monitoring settings retain the existing separate contract:
`LAUNCH_MONITORING_ENABLED=true`, `PRODUCTION_APP_URL=https://hellopera.online`, and
repository secrets `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` for production.
Subscribe the named operator to Actions failures. Test delivery and configure the
hosting log alert: >5% errors with at least five failures in 15 minutes.

## 4. Auth, recovery, and launch prerequisites

Keep production Supabase signups disabled until the launch gates pass.
For each Supabase project, configure Auth Site URL to its own app origin and allow
its `/auth/callback` URL. Configure Google credentials and the Supabase provider
callback if Google sign-in is offered. Never share production accounts with fixtures.

Configure production SMTP and verify delivery of signup confirmation and password
reset to an independent recipient. Test expired links and the support mailbox.
Confirm the private document bucket, RLS/RPC grants, expected cron jobs and admin.

Record backup timestamp and retention, restore into a separate project, restore
Storage document bytes separately, and run `npm run verify:restore` with the documented
source/target variables. Never run fixture suites against production. Run medium/large
staging performance suites and a real-device/OAuth deletion walkthrough. Record recovery
duration and an acknowledged monitoring alert before confirming launch gates.

## 5. Normal release

1. Merge reviewed code into `main`. CI runs clean install, Node check, types, lint,
   unit/database tests, build and public browser checks with placeholder public values.
2. The staging job checks platform compatibility and target configuration, then applies migrations, verifies database grants, deploys the exact CI
   SHA and waits up to 20 minutes for that deployment to be active and healthy.
3. It runs public/native-module smoke checks, live integration and browser suites,
   operational checks, then verifies the deployment again. Evidence is retained for
   90 days as `staging-release-<sha>` on the **CI run**, not a separate Release run.
4. Open Actions → Release → Run workflow on `main`. Enter the full SHA and successful
   staging **CI run ID**. Promotion verifies the GitHub run and downloaded evidence
   before checking out/executing that release. It checks migration hashes again.
5. Production applies reviewed additive migrations before deploying the same SHA.
   Environment-specific public configuration means staging and production are separate
   image builds of the same source. Readiness and operational checks must pass.

Release jobs serialize per environment and do not cancel in-progress migrations or
activation. GitHub may replace a pending queued run with a newer one; only releases
with retained successful staging evidence can be promoted. Artifact expiry requires
re-running staging verification, not bypassing promotion checks.

## 6. Failure and rollback

A failed HTTP response to the deployment POST can mean a deployment was queued.
The script does not retry the POST. Inspect HelloDeploy before restarting a workflow.
Failed/cancelled/rolled-back deployment states, identity mismatch and timeout fail CI.
A previously healthy homepage is not sufficient release evidence.

On post-release failure, open HelloDeploy → project → deployments, choose the previous
retained healthy release and use Rollback. Confirm the selected source SHA, public
configuration, `/api/health/ready`, sign-in, finance reads and image processing. Record
elapsed time and incident outcome. Do not automatically undo database migrations.
If an incompatible migration has been introduced, stop and use its separately reviewed
recovery procedure; application rollback alone cannot repair it.

Pre-upgrade images have no public-configuration snapshot. If restoring one manually,
verify its original public settings against the running container; new promotion
workflows require snapshots and will reject legacy release evidence.
