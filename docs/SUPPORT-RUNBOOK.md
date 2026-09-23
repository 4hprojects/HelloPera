# HelloPera support runbook

Use this for production incidents. Start with the user's approximate time and
the `x-request-id` response header when available. Search logs by that ID. Do
not ask for or paste transaction amounts, notes, merchant names, document
names, document contents, passwords, tokens, cookies, or provider secrets.

## First checks

1. Open `/api/health`. A `200` with `{"status":"ok"}` proves the process is alive.
2. Open `/api/health/ready`. A `200` proves Postgres and the document bucket are
   reachable. A `503` names only the failed dependency; inspect server logs for
   the matching time.
3. Open `/admin/system`. Check active dependency probes and recent job runs.
4. Run `npm run ops:check` from a configured operator environment.
5. Record the incident time, affected feature, status code, request ID, and the
   first safe error code. Do not record private financial content.

## Email not sending

1. Confirm Supabase Authentication email settings use the intended custom SMTP
   provider, sender address, and verified domain.
2. Check the provider's delivery log for accepted, bounced, blocked, or
   rate-limited mail. Search by recipient only inside the provider console.
3. Verify SPF, DKIM, and return-path records using the provider's domain check.
4. Trigger one signup and one password reset to an operator-owned test address.
5. If custom SMTP is absent, keep public signup closed. Supabase's default
   sender is suitable only for development. See `docs/EMAIL-SETUP.md`.

## Domain or redirect misconfigured

1. Confirm the domain's DNS resolves to the deployed service and HTTPS is valid.
2. Confirm `NEXT_PUBLIC_APP_URL` is the exact public HTTPS origin, with no path.
3. In Supabase Authentication URL configuration, verify the Site URL and all
   allowed redirect URLs use the same origin.
4. Check forwarded host and protocol headers at the deployment proxy.
5. Test signup confirmation, password reset, and Google OAuth in a private
   browser session, then inspect `/robots.txt` and `/sitemap.xml`.

## Scheduler stopped

1. Open `/admin/system` and inspect the newest run for each job type. A stale
   `running` row or repeated `failed` status needs investigation.
2. Run `npm run ops:check` and confirm all six Postgres cron jobs are active.
3. In Supabase, inspect `cron.job_run_details` for failures near the incident.
4. For push delivery, confirm `SCHEDULER_SECRET` and all VAPID values are set,
   then verify the external caller sends `Authorization: Bearer <secret>` to
   `POST /api/scheduler`.
5. Keep `push_enabled` off until a real-device delivery succeeds. In-app
   notifications and Postgres generation can remain available.

## Upload or image processing failure

1. Check `/api/health/ready` for database and storage reachability.
2. Check `/admin/system` for the Image processing probe. It exercises Sharp
   with generated data and never reads a user document.
3. Search logs by request ID for `storage upload failed` or `document processing
   failed`. Use the safe error code and path depth only.
4. Confirm the `financial-documents` bucket exists and the service key can use
   it. Do not make the bucket public.
5. Verify file type and size limits with an operator-owned sample. Never ask a
   user to send a financial document through email or chat for debugging.

## Payment webhook failure

1. Keep `billing_enabled` and `premium_enabled` off if the provider adapter or
   webhook signing secret is not fully configured.
2. Open `/admin/subscriptions`. Compare pending and failed event counts and note
   the safe event row prefix, provider, event type, and received time.
3. Match that time in provider delivery logs. Verify the endpoint URL and
   signature secret without printing the secret.
4. Search server logs for `billing webhook` and the relevant request ID.
5. Replay the event from the provider console after fixing configuration.
   Processing is idempotent by provider event ID, so a successful event is not
   applied twice.
6. Confirm the event becomes `processed` and the expected subscription state is
   visible. Do not manually edit balances or private financial records.

## Escalation record

For handoff, include only: UTC and local time, environment, affected route or
job type, HTTP status, request ID, safe error code, impact, actions attempted,
and current feature-flag state. Rotate any credential that was accidentally
shared and remove it from tickets and logs where possible.

