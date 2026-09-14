# HelloPera

A mobile-first personal finance tracking and financial document intelligence PWA.

```text
Capture → Understand → Confirm → Track → Analyze → Forecast
```

**Current phase: Phase 10 — Public Website, SEO and AdSense.**

Phases 00–10 are built. **Gate 1, the manual tracker**, is a complete personal
finance application: accounts, transactions, bills, receivables, expected
income, documents with OCR, a dashboard with analytics, recurring rules and a
deterministic forecast, reminders, and a monetization foundation.

Phase 10 adds the public marketing site, guides, SEO foundations, and consent
and advertising infrastructure that is built but switched off.

> **Not yet launched.** The database migrations have not been applied to a
> remote project, and the master plan's pre-public-launch gate has two
> outstanding operational items. Start at **[docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md)**
> — it lists what is left, what each item blocks, and what nobody has verified.

Phase docs live in `docs/`, one per phase, each with its own acceptance
criteria. `docs/DATA-MODEL.md` is the consolidated schema reference and is kept
current in the same commit as any migration.

---

## Local setup

Requires **Node 22** (`.nvmrc` is provided; production runs `node:22-alpine`).

```sh
nvm use
npm ci
cp .env.example .env.local     # then fill in your Supabase values
npm run dev
```

Open http://localhost:3030.

### Environment

| Variable                        | Required       | Notes                                                      |
| ------------------------------- | -------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes            | `https://<ref>.supabase.co` — **no `db.` prefix**          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes            | anon/publishable key, never `service_role`                 |
| `SUPABASE_SECRET_KEY`           | yes            | `sb_secret_…`, server-only. Every mutation goes through it |
| `DATABASE_URL`                  | for migrations | **Pooler** host, not `db.<ref>` — see below                |
| `NEXT_PUBLIC_APP_NAME`          | no             | defaults to `HelloPera`                                    |
| `NEXT_PUBLIC_APP_URL`           | no             | defaults to `http://localhost:3030`                        |

`SUPABASE_SECRET_KEY` is required from Phase 01 onward: user tables grant the
browser `SELECT` only, so every write goes through a server action that checks
ownership in code first. Verify the key with `npm run check:key`.

Configuration is validated at startup by `lib/env`. It checks shape, not just
presence — a present-but-wrong value fails far from its cause. Two guards exist
because both mistakes have already happened here:

- **`db.` prefix.** `db.<ref>.supabase.co` is the Postgres host. It serves no
  HTTP API and is IPv6-only, so it presents as an unexplained network timeout
  rather than an error.
- **`service_role` key.** Behind a `NEXT_PUBLIC_` prefix it ships full
  RLS-bypassing database access to every browser. It looks identical to the
  anon key by eye; the difference is a claim inside the JWT.

---

## Commands

```sh
npm run dev           # development server
npm run build         # production build (standalone output)
npm start             # run the production build
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run format        # Prettier write
npm run format:check  # Prettier check
```

---

## Architecture

```text
Next.js + React + TypeScript + Tailwind   application
Supabase                                  auth, database, storage — system of record
HelloDeploy                               stateless container compute
Cloudflare                                DNS, edge, TLS
```

```text
app/
  (public)/     marketing and legal shell
  (app)/        authenticated shell — placeholder until Phase 01
  admin/        operational shell — placeholder until Phase 01
  api/          route handlers
components/     ui/, layout/, navigation/, brand/
lib/            env/, supabase/, constants/, log/, utils/
services/       business logic          (Phase 02 onward)
schemas/        Zod validation          (Phase 01 onward)
hooks/ types/
```

There is deliberately **no `repositories/` layer** — services own their queries.
See `docs/PHASE-02-FINANCIAL-CORE.md` §39.

### Two rules that apply from here on

**Writes go through server actions.** Client RLS grants `SELECT` on own rows
only. The browser holds the anon key and can reach PostgREST directly, so RLS
cannot distinguish your service layer from devtools — a field the client never
sends is a field the client cannot set. See master plan §33.

**Money is never a float.** Amounts are `numeric(18,2)` in Postgres, always
positive, with direction carried by transaction type and account role rather
than by sign. See `docs/PHASE-02-FINANCIAL-CORE.md` §34.

---

## Design system

HelloPera Jade. Tokens live in `app/globals.css` as one semantic set redefined
per theme — components reference a role, never a theme.

Colour comes in two families, because the brand hexes fail WCAG AA as body
text on the light ground (Primary Jade is 4.00:1, Muted 4.00:1, Gold 2.48:1):

- `--hp-{role}` — fills, borders, chart marks, large display figures
- `--hp-{role}-text` — text and solid button fills, all measured ≥ 4.5:1

Income and expense amounts are text, so they use the `-text` variants. Target
is **WCAG 2.2 AA**. Status is never conveyed by colour alone.

---

## Platform notes

Production runs on HelloDeploy: `node:22-alpine`, `.next/standalone`, behind
nginx. Three constraints shape the design and are not negotiable from inside
the app:

| Constraint         | Value | Consequence                                   |
| ------------------ | ----- | --------------------------------------------- |
| Request body limit | 10 MB | Upload limits are 8 MB (Phase 04)             |
| Request timeout    | 60 s  | OCR is asynchronous (Phase 05)                |
| Scheduled jobs     | none  | Scheduling uses Supabase `pg_cron` (Phase 07) |

`GET /api/platform-check` exercises Sharp end to end. It exists to answer the
one question a green build cannot: whether the native binary loads inside the
Alpine container. Hit it after the first deploy. It is removed or folded into
the image service in Phase 04.

Full capability matrix: `docs/PLATFORM-HELLODEPLOY.md`.

---

## Documentation

| Document                        | Purpose                                      |
| ------------------------------- | -------------------------------------------- |
| `docs/HELLOPERA-MASTER-PLAN.md` | Product identity and cross-cutting rules     |
| `docs/DATA-MODEL.md`            | Every table, and the phase that creates it   |
| `docs/PLATFORM-HELLODEPLOY.md`  | Verified platform capabilities and fallbacks |
| `docs/PLAN-REVIEW.md`           | Findings from the planning review            |
| `docs/PHASE-00…14-*.md`         | Per-phase implementation specs               |

Build one phase at a time. Do not start a phase until the previous one passes
its acceptance criteria.
