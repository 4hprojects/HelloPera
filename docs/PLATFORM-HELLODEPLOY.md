# HelloPera — HelloDeploy Capability Matrix

## Purpose

HelloDeploy is the compute platform for HelloPera. Every phase of this plan assumes something about it, but those assumptions were spread across the phase documents and would have been discovered one at a time, each at the phase that needed it — the scheduling assumption not until Phase 07, by which point six phases sit on the platform.

This document collects every assumption in one place so all of them are verified **during Phase 00**, before any of them is load-bearing.

Rule:

```text
Phase 00 is not complete until every row below is marked Verified or Not available with a chosen fallback.
```

A row marked **Not available** is not a failure. It is a design input, discovered while it is still cheap to act on.

---

## How to use this document

1. During Phase 00, work down the matrix and fill in the Result column.
2. For any capability that is unavailable, adopt the fallback and note the decision in the Notes column.
3. Re-verify after any HelloDeploy plan change, runtime upgrade or migration.
4. Each phase's deployment checks reference this file rather than re-deriving its own platform requirements.

---

## Matrix

### 1. Runtime

| # | Capability | Needed by | Why | How to verify | Fallback if unavailable |
|---|---|---|---|---|---|
| R1 | Node.js version compatible with the chosen Next.js and Sharp | Phase 00 | Everything | `node -v` on the deployed host; compare against Next.js and Sharp support matrices | Pin to the highest supported Node the platform offers; if below Sharp's minimum, see I1 |
| R2 | Node runtime available for route handlers — **not** Edge-only | Phase 04 | Sharp cannot run on Edge | Deploy a route with `export const runtime = 'nodejs'` and confirm it serves | Move image processing off-platform (Supabase Edge Function with a WASM codec, or a small dedicated worker) |
| R3 | Long-lived process, not per-request cold start only | Phase 05, 07 | OCR duration; scheduler | Measure cold vs warm response time on a trivial route | Accept cold starts; move OCR fully async with polling (Phase 05 §48 already designs for this) |
| R4 | Pinned, reproducible builds (`npm ci` with committed lockfile) | Phase 00 | Avoids production drift | Confirm the build command and that the lockfile is respected | Document exact install command; never rely on floating versions |

### 2. Native modules and filesystem

| # | Capability | Needed by | Why | How to verify | Fallback if unavailable |
|---|---|---|---|---|---|
| I1 | Native module support — Sharp installs and its binaries execute | Phase 04 | WebP conversion, thumbnails, orientation | Deploy a route that calls `sharp(buf).resize(64).webp().toBuffer()` and returns the byte length | `@jsquash/webp` or equivalent WASM codec; slower, but no native dependency |
| I2 | Writable temp directory, with a known size limit | Phase 04 | Sharp scratch space (P04 §45) | Write, read back and delete a file in `os.tmpdir()`; report free space | Process entirely in memory under a reduced size cap; lower `MAX_IMAGE_BYTES` accordingly |
| I3 | PDF page rendering dependency (poppler / pdfium / equivalent) | Phase 05 | Rasterising PDF pages when the OCR provider lacks native PDF input | Attempt to render page 1 of a sample PDF to PNG | **Preferred:** choose an OCR provider with native PDF support and skip this entirely. See P05 §63. |
| I4 | No reliance on local disk for persistent state | All | Master plan §5: HelloDeploy stays stateless | Confirm the filesystem is ephemeral and document it | None needed — this is an architectural rule, not a platform feature |

### 3. Request handling

| # | Capability | Needed by | Why | How to verify | Fallback if unavailable |
|---|---|---|---|---|---|
| Q1 | Request body limit ≥ 20 MB | Phase 04 | PDF upload ceiling (P04 §16) | POST a 20 MB body and confirm it is not rejected upstream | Lower `MAX_PDF_BYTES` / `MAX_IMAGE_BYTES` to the real limit, or upload directly to Supabase Storage with a signed upload URL and process server-side afterwards |
| Q2 | Request timeout long enough for synchronous OCR | Phase 05 | P05 §47 allows synchronous processing initially | Time a deliberately slow route against the platform's cutoff | Make OCR asynchronous from the start — job row plus polling, which P05 §11 and §48 already accommodate |
| Q3 | Inbound webhook endpoint reachable through Cloudflare | Phase 11 | Billing provider callbacks (P11 §70) | Send a signed test event from the provider's dashboard to the deployed URL | Cloudflare page rule bypassing bot protection for the webhook path; verify the provider's IPs are not challenged |
| Q4 | Streaming / chunked responses | Phase 12 | Only if AI answers stream | Return a streamed response and confirm it is not buffered | Return complete responses; the assistant works without streaming |

### 4. Scheduling — the highest-risk row

| # | Capability | Needed by | Why | How to verify | Fallback if unavailable |
|---|---|---|---|---|---|
| S1 | Scheduled invocation (cron) at hourly granularity | **Phase 07, 08** | Recurring-event generation; reminder evaluation (P07 §20, P08 §35) | Schedule a job that writes a row every hour; confirm three consecutive runs | **Ranked fallbacks:** (a) Supabase `pg_cron` calling a database function; (b) Supabase scheduled Edge Function calling a secured HTTP endpoint; (c) external scheduler (GitHub Actions scheduled workflow) hitting the endpoint with `NOTIFICATION_SCHEDULER_SECRET` |
| S2 | Guarantee against overlapping runs | Phase 07, 08 | Two schedulers must not double-generate (P07 §65, P08 §61) | Trigger the same job twice concurrently and confirm one is refused | Do not rely on the platform — Phase 07's `job_runs` table and Postgres advisory lock make this safe regardless |
| S3 | Scheduler execution time limit | Phase 07, 08, 11 | Generation, reminders and reconciliation must fit inside it | Measure the platform's cutoff | Chunk the work and make each run resumable; `job_runs` records progress |

> **S1 is the assumption most likely to break the plan.** If it fails and no fallback is adopted, Phases 07, 08, 11 and 14 all need redesign. Verify it first.

### 5. Configuration and secrets

| # | Capability | Needed by | Why | How to verify | Fallback if unavailable |
|---|---|---|---|---|---|
| E1 | Server-only environment variables, never bundled to the client | Phase 00 | Service-role key, OCR/AI/billing secrets | Build for production and grep the client bundle for a sentinel secret value | Do not deploy. This is a hard requirement, not a preference. |
| E2 | Separate configuration per environment | Phase 14 | Staging billing must never touch production (P14 §5) | Confirm distinct variable sets for staging and production | Separate HelloDeploy projects/apps per environment |
| E3 | Secret rotation without a code change | Phase 14 | P14 §8 | Change a value and redeploy without editing source | Document the rotation runbook explicitly, including the redeploy step |
| E4 | Build metadata exposed (commit SHA or release ID) | Phase 13, 14 | Admin system page, incident triage (P14 §12) | Read it from the running app | Inject manually at build time |

### 6. Database connectivity

| # | Capability | Needed by | Why | How to verify | Fallback if unavailable |
|---|---|---|---|---|---|
| D1 | Connection mode appropriate to the execution model | Phase 14 | Avoid exhausting Postgres connections (P14 §36) | Load-test and watch Supabase connection count | Use Supabase's transaction-mode pooler; if the platform is serverless, pooling is mandatory, not optional |
| D2 | Outbound HTTPS to Supabase, OCR, AI and billing providers | Phases 01, 05, 11, 12 | Every external call | Curl each provider's health or auth endpoint from a deployed route | None — without this the architecture does not work |
| D3 | Stable outbound IP, if any provider requires allowlisting | Phase 11 | Some payment providers restrict by IP | Check the provider's requirements against the platform's egress | Choose a provider that does not require IP allowlisting |

### 7. Operations

| # | Capability | Needed by | Why | How to verify | Fallback if unavailable |
|---|---|---|---|---|---|
| O1 | Rollback to a previous deployment | Phase 14 | P14 §13 | Deploy twice, roll back, confirm the prior version serves | Keep a tagged release branch and redeploy from it; document the procedure and its duration |
| O2 | Log access and retention | Phase 14 | Incident response (P14 §25) | Emit a structured log line and retrieve it | Ship logs to an external collector |
| O3 | Health endpoint reachable by external uptime monitoring | Phase 14 | P14 §88 | Hit the health route from outside Cloudflare | None needed; ensure the route is not behind auth |
| O4 | Custom domain with HTTPS, behind Cloudflare | Phase 00 | Master plan §5 | Load the production domain and inspect the certificate | None — required |

---

## What HelloDeploy Is

Verified 2026-09-13 by reading the source at
`~/Documents/MyProjects/HelloDeploy`.

HelloDeploy is a self-hosted deployment platform. It connects a GitHub repo,
detects the runtime, builds a platform-generated Dockerfile, and runs the
result as a Docker container behind nginx. It provides custom domains with DNS
verification, encrypted environment secrets, live deploy logs, health checks,
per-project maintenance mode, rollback to retained healthy releases, and audit
logging.

It requires MongoDB, Redis and Docker on the host. Those are the platform's own
dependencies, not HelloPera's — HelloPera still uses Supabase for all
persistence.

### The Next.js Container

`apps/worker/src/deployment/dockerfile-generator.js` generates this for a
Next.js project:

```dockerfile
FROM node:22-alpine AS deps
RUN npm ci --prefer-offline

FROM node:22-alpine AS builder
RUN <build command>

FROM node:22-alpine
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Four consequences, all load-bearing:

- **Node 22 on Alpine (musl libc).** Not glibc. Native modules need musl
  builds.
- **`.next/standalone` output.** Requires `output: 'standalone'` in
  `next.config`, and only file-traced dependencies reach the final image.
- **A long-lived process**, not serverless. One `CMD`, one container.
- **No second process.** There is no worker product — anything scheduled must
  run inside the web container.

### The nginx Proxy

`infrastructure/nginx/hellodeploy-platform.conf.template` and
`apps/worker/src/nginx/template.js`:

```nginx
client_max_body_size 10m;
proxy_read_timeout   60s;
```

These are the hard ceilings on request size and duration.

---

## Verification record

Verified 2026-09-13 against the HelloDeploy source. Re-check after any
platform upgrade.

| Row | Result | Date | Notes |
|---|---|---|---|
| R1 | **Verified** | 2026-09-13 | Node 22 (`node:22-alpine`). Local dev is Node 20 — pin `.nvmrc` to 22 to remove drift. |
| R2 | **Verified** | 2026-09-13 | Full Node runtime, `CMD ["node","server.js"]`. Not Edge. |
| R3 | **Verified** | 2026-09-13 | Long-lived container process. No cold starts. |
| R4 | **Verified** | 2026-09-13 | `npm ci --prefer-offline` in the deps stage. Commit the lockfile. |
| I1 | **Mostly proven** | 2026-09-13 | Standalone carries Sharp incl. musl binaries, and runs. Alpine load untested. See note A. |
| I2 | **Verified** | 2026-09-13 | Container filesystem is writable; ephemeral, which is what §I4 wants anyway. |
| I3 | **Not available** | 2026-09-13 | No poppler/pdfium in the image, and the Dockerfile is platform-generated — HelloPera cannot add `apk` packages. **Choose an OCR provider with native PDF input.** |
| I4 | **Verified** | 2026-09-13 | Containers are replaced on deploy. Nothing persists locally. Correct by construction. |
| Q1 | **Not available** | 2026-09-13 | nginx `client_max_body_size 10m`. The 20 MB PDF ceiling is unreachable. See note B. |
| Q2 | **Constrained** | 2026-09-13 | nginx `proxy_read_timeout 60s`. Synchronous OCR must finish inside 60s. See note C. |
| Q3 | **Verified** | 2026-09-13 | Custom domains with DNS verification; normal inbound HTTP. Confirm Cloudflare does not challenge the provider when Phase 11 arrives. |
| Q4 | Unverified | | Optional; only if assistant answers stream. |
| S1 | **Not available** | 2026-09-13 | Scheduled jobs are explicitly deferred in `hellodeploy-blueprint/11_DECISIONS_AND_DEFERRED_WORK.md`, alongside background worker products. See note D. |
| S2 | **N/A → use our own** | 2026-09-13 | No platform scheduler to overlap. Phase 07's advisory lock covers the in-process one. |
| S3 | **N/A** | 2026-09-13 | No platform-imposed job time limit; the 60s proxy timeout does not apply to in-process work. |
| E1 | **Verified** | 2026-09-13 | Encrypted environment secrets. Still grep the client bundle — that risk is Next.js's, not the platform's. |
| E2 | **Verified** | 2026-09-13 | Per-project environment configuration. Use separate projects for staging and production. |
| E3 | **Verified** | 2026-09-13 | Secrets are edited in the platform UI and applied on redeploy. No code change needed. |
| E4 | **Verified** | 2026-09-13 | Deploys are commit-pinned; expose the SHA via a build-time env var. |
| D1 | **Verified** | 2026-09-13 | Long-lived container, so a normal pooled client is fine. Supabase transaction-mode pooler still recommended. |
| D2 | **Verified** | 2026-09-13 | Standard outbound networking from the container. |
| D3 | Unverified | | Only matters if the Phase 11 provider requires IP allowlisting. Self-hosted, so the egress IP is stable and known. |
| O1 | **Verified** | 2026-09-13 | Rollback to retained healthy releases is a platform feature. |
| O2 | **Verified** | 2026-09-13 | Live deploy logs over SSE. For app logs, ship to an external collector. |
| O3 | **Verified** | 2026-09-13 | Configurable health check path. |
| O4 | **Verified** | 2026-09-13 | Custom domains with DNS verification; HTTPS terminated at nginx. |

---

## Notes

### A — Sharp on Alpine with standalone output (row I1)

Two hazards were predicted here: musl-vs-glibc binaries, and
`.next/standalone` copying only file-traced dependencies. **A spike was built
and run on 2026-09-13.** Results:

**Proven** — Next.js 15.5.4, Sharp 0.34.4, Node 20, glibc Linux x64:

- `.next/standalone` carries `sharp`, both `@img/sharp-linux-x64` and
  `@img/sharp-linuxmusl-x64`, and both `libvips-cpp.so` variants.
- The standalone server starts and Sharp executes end to end — a 1200x800 PNG
  resized and converted to a 1788-byte WebP display image and a 242-byte
  thumbnail, with libvips 8.17.2.
- **Neither `serverExternalPackages` nor `outputFileTracingIncludes` was
  required.** A bare `output: 'standalone'` produced identical results. Both
  were tested with the config removed.

Why the musl binaries appear on a glibc machine: Sharp declares every platform
as an optional dependency, and npm filters on `os` and `cpu` but not `libc`.
So a glibc host installs the musl package too. HelloDeploy's build runs
`npm ci` *inside* `node:22-alpine` anyway, which resolves musl natively.

**Still unproven:** that the musl binary actually *loads* under Alpine, and
that Node 22 behaves as Node 20 did. Neither could be tested here — the Docker
daemon was running but the account is not in the `docker` group.

So the Phase 00 requirement stands, narrowed:

```text
Deploy a route that calls Sharp to HelloDeploy and hit it.
```

A green build still proves nothing. But the risk is now one unknown rather
than three, and the mitigation is simpler than expected:

```js
// next.config — this is sufficient
output: 'standalone',
```

Keep `serverExternalPackages: ['sharp']` if you want it as documentation of
intent; it changed nothing in testing. Drop `outputFileTracingIncludes` — it
solves a problem that does not exist on these versions.

Fallback if Alpine load fails: `@jsquash/webp`, a WASM codec — slower, no
native dependency, immune to the libc question entirely.

**Re-verified 2026-09-13 on the shipped stack** — Next 16.3.5, Sharp 0.35.4,
Node 22:

- Standalone still carries Sharp and it still runs (`/api/platform-check`
  returns `ok: true`, libvips 8.18.6).
- **Only the glibc binary is now present.** Sharp 0.35.4 declares
  `libc: ["glibc"]` on `@img/sharp-linux-x64`, so npm correctly filters the
  musl package out on a glibc host — where 0.34.4 installed both.

That makes the Alpine question sharper, not safer: the build **must** run
inside Alpine so `npm ci` resolves the musl variant there. HelloDeploy does
exactly that (its deps stage is `FROM node:22-alpine`), and it builds from a
git checkout where `node_modules` is gitignored, so a glibc `node_modules`
cannot leak into the image.

The remaining unknown is unchanged and still only answerable by deploying:
does the musl binary load under Alpine? `/api/platform-check` answers it in
one request.

Re-run this check after any Next.js or Sharp major upgrade. Tracing and
optional-dependency filtering are exactly the kind of thing that changes
quietly between majors.

### B — The 10 MB body limit (row Q1)

`PHASE-04` §16 proposed 10 MB images and 20 MB PDFs. The proxy caps every
request at 10 MB, so the PDF ceiling is unreachable and a 10 MB image would
fail too once multipart overhead is counted.

Two options:

1. **Lower the limits.** 8 MB images, 8 MB PDFs, enforced client-side before
   upload so the user gets a real message instead of an nginx 413.
2. **Upload directly to Supabase Storage** with a signed upload URL, then have
   the server process the stored object. This bypasses the proxy entirely and
   removes the ceiling. More moving parts, but it is the better shape for a
   document-heavy product and worth doing when the limit starts to bite.

Start with option 1. It is a config change; option 2 is a rearchitecture.

### C — The 60-second timeout (row Q2)

`PHASE-05` §47 allows synchronous OCR "if response times are acceptable". The
ceiling is now a number: 60 seconds, including upload, provider round trip,
extraction and response.

A single clear receipt fits comfortably. A multi-page PDF will not. Since
`ocr_jobs` and the polling UI (§48) already exist in the design, **go
asynchronous from the start** — the synchronous path is a shortcut that
expires the first time a user uploads something large.

### D — No scheduled jobs (row S1)

This was flagged as the highest-risk assumption in the plan, and it did not
hold. Phases 07, 08 and 11 all need scheduled execution; HelloDeploy has none
and lists both scheduled jobs and worker products as deferred.

Ranked options:

1. **In-process scheduler** (`node-cron` or a timer) inside the Next.js
   container. The container is long-lived, so this works today. It is the
   least infrastructure and keeps job code beside the services it calls.
   - Risk: it dies with the container and runs per replica. HelloDeploy is
     single-replica today and the platform's own notes treat multi-replica as
     future work — and Phase 07's advisory lock already makes concurrent runs
     safe, so this degrades gracefully rather than corrupting.
   - Requires the container to stay warm. It does; there is no sleep-on-idle
     today, though "whether inactive applications will eventually sleep" is an
     open platform decision worth watching.
2. **Supabase `pg_cron`** calling a database function, or a scheduled Edge
   Function calling a secured HTTP endpoint. Survives container restarts and
   is independent of HelloDeploy entirely. More moving parts, but the
   scheduling lives with the data.
3. **External scheduler** — a scheduled GitHub Actions workflow calling the
   endpoint with `SCHEDULER_SECRET`. Free, visible, and easy to reason about,
   at the cost of a third system.

**Recommendation: option 2 for generation and reminders**, because it survives
restarts and HelloPera's scheduled work is database-shaped anyway. Option 1 is
a reasonable start if `pg_cron` is unavailable on the Supabase plan — verify
that during Phase 00, since it decides Phase 07's shape.

---

## If HelloDeploy turns out to be unsuitable

The plan deliberately keeps HelloDeploy replaceable. Supabase is the system of record; HelloDeploy is stateless compute (master plan §5). If several rows fail with no acceptable fallback, moving to another Node host changes deployment configuration and this document — not the application architecture.

Preserve that property: never write permanent state to the platform's filesystem, and never depend on a platform-proprietary API inside business logic.
