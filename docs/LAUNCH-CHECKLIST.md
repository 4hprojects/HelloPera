# HelloPera — launch checklist

Everything that cannot be done from the codebase. These are operational,
account-level or judgement calls, grouped by what they block.

Nothing here is optional theatre: each item blocks something specific, and the
blocked thing is named.

Last updated: 14 September 2026 (end of Phase 10 implementation).

---

## Status at a glance

| Area | State |
|---|---|
| Code | Phases 00–12 built, 655 tests passing |
| Remote database | **11 of 20 applied** — 9 pending, including a live security fix |
| Scheduled jobs | Unknown — `pg_cron` availability unconfirmed |
| Push notifications | Unconfigured — no VAPID keys |
| Email | Unconfigured — Supabase default is ~2/hour, dev only |
| Domain | `hellopera.online` does not resolve |
| Ads | Off by flag, no AdSense account |
| Payments | No provider chosen — see §11 |
| Assistant | Built, off by flag, needs an API key — see §12 |
| Public launch | **Blocked** — see §1 |

---

## 1. The pre-public-launch gate (master plan §54a)

**This blocks publishing the public site and taking any payment.** Five of the
seven items are done in code; two are yours and cannot be automated.

- [ ] **Confirm a database backup exists.** Supabase Dashboard → Database →
      Backups. Note the retention period your plan gives you.
- [ ] **Restore that backup into a non-production project, and confirm the data
      arrives.** This is the item the master plan is blunt about: *"A backup
      that has never been restored is not a backup."* Holding people's
      financial documents without a demonstrated restore is the position it
      exists to prevent.

Already done in code, but re-verify once the migrations are applied:

- [x] Account deletion — `/settings/delete`, verified to clear every
      user-owned table
- [x] Data export — `/settings/data`, paged so it cannot silently truncate
- [x] Auth rate limiting — active on login, registration and password reset
- [x] No secret reachable from the client bundle — `lib/env` rejects a
      `service_role` key behind `NEXT_PUBLIC_`
- [ ] **Cross-user access tests passing against the live project.** The test
      exists (`services/analytics.integration.test.ts`) but has never run,
      because it creates real auth users. See §3.

---

## 2. Apply the database migrations

**Blocks: everything from Phase 07 onward.** `/recurring`, `/forecast`,
`/notifications`, `/settings/plan`, `/settings/billing` and
`/admin/subscriptions` will all error until their tables exist.

- [ ] Set `DATABASE_URL` in `.env` to the **pooler** connection string
      (Dashboard → Settings → Database → Connection string). The direct
      `db.<ref>` host is IPv6-only and will not connect from most networks —
      `scripts/db.mjs` rejects it deliberately.
- [ ] `npm run db:status` — see what is pending.
- [ ] `npm run db:migrate` — apply. Each file runs in one transaction, so a
      failure leaves nothing half-applied.
- [ ] `npm run db:verify` — confirm RLS is enforced.

**This is now confirmed on your live project, not a theoretical risk.**
Supabase's own linter reports 16 `SECURITY DEFINER` functions callable by the
`anon` role — including `create_transaction`, `create_account`,
`void_transaction` and `allocate_payment` — over `/rest/v1/rpc/…`, with no sign-in
at all. Your tables are empty, so nothing is at risk yet; the endpoint is open
regardless.

**Apply this one first if you apply nothing else:**
`20260914000200_revoke_function_execute_from_public.sql`. Until it runs, every
`SECURITY DEFINER` function is callable by any browser holding the publishable
key. Verified locally: an ordinary signed-in user could create an account in
another user's name and stop another user's recurring rule for four years. The
`revoke … from anon, authenticated` written since Phase 02 never worked,
because those roles inherit `EXECUTE` from `PUBLIC`.

---

## 3. Run the integration tests against the live project

**Blocks: gate item 7, and the security claim in the privacy policy.**

These are excluded from `npm test` because they need live credentials and
create real rows.

- [ ] Ensure `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
- [ ] `npm run test:integration`
- [ ] Confirm `services/analytics.integration.test.ts` passes — it signs in as
      two real users and asserts neither can read the other's data. It creates
      and then deletes its own test accounts.

---

## 4. Scheduled jobs (`pg_cron`)

**Blocks: recurring occurrence generation and notification delivery happening
on their own.** Both still work when a user opens the relevant page — the lazy
safety checks cover correctness — so this governs *timeliness*, not whether the
features work.

- [ ] Confirm `pg_cron` is available on your Supabase plan
      (Dashboard → Database → Extensions).
- [ ] After migrating, check the jobs registered:
      `select jobname, schedule from cron.job;`
      Expect `recurring_generation` (hourly), `notification_generation`
      (hourly at :05), `notification_cleanup` and `rate_limit_cleanup` (daily).
- [ ] If `pg_cron` is **not** available, the migrations still applied — they
      warn rather than fail. Pick a fallback from `PHASE-07` §2: a Supabase
      scheduled Edge Function, or a GitHub Actions workflow calling
      `POST /api/scheduler`.

---

## 5. Email (blocks signup for anyone but you)

Supabase's built-in sender is capped at roughly **2 emails per hour** and is
development-only. Signup and password reset both send email.

Full instructions: `docs/EMAIL-SETUP.md`.

- [ ] Create a Resend account and add your domain.
- [ ] Complete the DNS records (SPF, DKIM, return-path).
- [ ] Create an API key and configure Supabase's SMTP settings with it.
- [ ] Test a real signup to an address that is not your own — until the domain
      verifies, Resend only delivers to your own account address.

---

## 6. Push notifications

**Blocks: push delivery only.** In-app notifications work without this.

- [ ] Generate a key pair: `npx web-push generate-vapid-keys`
- [ ] Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
      `VAPID_SUBJECT` (a `mailto:` address).
- [ ] Set `SCHEDULER_SECRET` (`openssl rand -hex 32`) — without it
      `POST /api/scheduler` returns 503 rather than running unauthenticated.
- [ ] Arrange for something to call `POST /api/scheduler` periodically with
      `Authorization: Bearer <SCHEDULER_SECRET>`. Generation runs in Postgres;
      delivery cannot, because it needs the VAPID keys and an HTTPS request per
      subscription.
- [ ] Test on a real device — push has never been sent, only type-checked.

---

## 7. Domain and deployment

**Blocks: canonical URLs, the sitemap, Search Console and AdSense review.**

- [ ] Point `hellopera.online` (or whichever domain) at the deployment.
- [ ] Confirm HTTPS is active — AdSense review requires it (§87).
- [ ] Set `NEXT_PUBLIC_APP_URL` to the real origin. Everything canonical
      derives from `appUrl()`, so a wrong value here puts the wrong host in
      every `<link rel="canonical">` and every sitemap entry.
- [ ] Deploy and confirm `/robots.txt` and `/sitemap.xml` respond.

---

## 8. Search Console (§86)

**Blocks: knowing whether any of the SEO work is working.**

- [ ] Verify domain ownership in Google Search Console.
- [ ] Submit `https://<domain>/sitemap.xml`.
- [ ] Check that private routes are **not** indexed — search
      `site:<domain> /dashboard` and expect nothing.
- [ ] Monitor Core Web Vitals once there is traffic.

---

## 9. Before applying to AdSense (§87)

Only start this once §1 and §7 are done. Applying with an incomplete site
risks a rejection that is slow to appeal.

- [ ] Public site fully navigable, no placeholder pages, no lorem ipsum.
- [ ] Enough original content to be worth indexing. Four guides ship today;
      §40 says quality matters more than a count, but four is thin.
- [ ] Privacy, Terms, About and a working contact path — all present.
- [ ] Create the AdSense account and get a publisher id.
- [ ] Set `NEXT_PUBLIC_ADSENSE_CLIENT_ID` (`ca-pub-` + 16 digits).
- [ ] Add the seller line to `public/ads.txt` — it ships deliberately empty,
      because a placeholder id would authorise an account that is not yours.
- [ ] **Decide on EEA/UK traffic.** The recorded decision
      (`lib/consent/categories.ts`) is to scope those regions out at launch.
      Serving ads there requires a Google-certified CMP integrated with the IAB
      TCF — a hand-rolled banner does not qualify, however correct its
      categories.

---

## 10. Flags to flip, and when

All default off. Each is a row in `feature_flags`.

| Flag | Turn on when |
|---|---|
| `ads_enabled_global` | AdSense approved, publisher id set, §9 complete |
| `billing_enabled` | Phase 11 ships a real payment provider |
| `premium_enabled` | Premium is actually purchasable |
| `ai_enabled` | Phase 12 |

```sql
update public.feature_flags set enabled = true where key = 'ads_enabled_global';
```

Ads additionally require the visitor to have consented and the surface to be a
public page — the flag alone shows nothing.

---

## 11. Payments — what Phase 11 still needs from you

Phase 11 built everything that does not require a provider: the subscription
state machine, webhook processing, the billing tables, and `/settings/billing`.
It cannot go further alone, because §6 of the phase document deliberately leaves
the provider unchosen and the rest needs an account only you can open.

Nothing here is urgent. `billing_enabled` is off, `/settings/billing` returns
404 while it is off, and the webhook endpoint refuses every request — so the
application is safe to run indefinitely in this state.

- [ ] **Choose a provider.** For the Philippines the realistic options are
      PayMongo, Xendit, Dragonpay or Stripe. Decide on the payment methods your
      users actually have (GCash and Maya matter more here than cards) before
      comparing fees.
- [ ] **Open the account and complete their verification.** This is usually the
      longest step — business documents, bank account, and a review period.
- [ ] **Write the adapter.** One file implementing `BillingProvider` from
      `lib/billing/provider.ts`, plus `setBillingProvider()` at startup. Its job
      is signature verification and translating the provider's vocabulary into
      `BillingEvent` / `ProviderSubscription` / `NormalisedInvoice`. Nothing
      else in the application needs to change.
- [ ] **Set the webhook secret** as an environment variable, and point the
      provider at `https://<your-domain>/api/billing/webhook`. This needs a
      public HTTPS URL, so §7 comes first.
- [ ] **Create the `premium` plan row** with a real price. §36 forbids showing
      an invented number, which is why `/pricing` currently shows none.
- [ ] **Test with the provider's sandbox before the flag goes on** — a
      successful payment, a failed one, a cancellation, and a replayed webhook.
      The replay should change nothing the second time.
- [ ] **Only then** set `billing_enabled` and `premium_enabled`.

One thing worth knowing before you start: account deletion now calls the
provider to cancel the subscription before deleting anything, and refuses to
proceed if that call fails. That is deliberate — the alternative is a deleted
account with a live subscription still charging a card — but it does mean a
broken adapter blocks deletions for paying users.

---

## 12. The assistant — what Phase 12 still needs from you

Phase 12 built the whole assistant: the intent layer, the approved query
catalog, the validation, the deterministic answers, and a working Claude
adapter. It is off, and safe to leave off indefinitely — `/assistant` returns
404 while `ai_enabled` is false, and with no key it refuses rather than guesses.

- [ ] **Set `ANTHROPIC_API_KEY`.** This is the same key OCR needs, so setting it
      switches on document reading as well as the assistant. Nothing else in the
      product depends on it.
- [ ] **Optionally pin the models.** `AI_INTENT_MODEL` and
      `AI_EXPLANATION_MODEL` override the defaults in `lib/ai/model.ts` without
      a code change, which is what makes swapping one for cost or latency a
      deployment decision.
- [ ] **Apply the migrations** (§2) — `ai_conversations`, `ai_messages` and
      `ai_usage_logs` are in `20260914000900`.
- [ ] **Then set `ai_enabled`.** Only after the key and the tables, or the page
      appears in navigation and fails.
- [ ] **Watch the first week's cost** in `ai_usage_logs`. One question is one
      quota unit but may be two provider calls; the gap between that table and
      `usage_records` is your real cost per question.

Worth knowing: Free is 5 questions a month and Premium 100, both seeded in
`20260914000500`. Those are placeholders from the phase document, not a priced
decision — change them in `plan_entitlements` once you know what a question
actually costs.

---

## 13. Not yet verified by anyone

Stated plainly so it is not mistaken for done:

- **No signed-in page from Phases 07–12 has been rendered in a browser.** They
  compile, build and are type-checked, but the tables they read do not exist
  remotely yet. Expect small UI problems on first run.
- **The signed-out pages have now been rendered**, in a headless Chrome at 320,
  360, 414 and 768px. That pass found the site header overflowing every phone
  width — the landing page scrolled sideways by 237px at 320px — which is now
  fixed and re-measured. It is a fair warning about the pages that have not had
  the same treatment.
- **Push has never been sent to a device.**
- **The scheduler endpoint has never been called.**
- **No payment has ever been taken**, and no provider adapter exists. The
  webhook endpoint refuses everything (§11).
- **No question has ever been asked of the assistant**, because no API key is
  configured. Its pure layers are tested; the provider call itself is verified
  only against a stub.
- **The SQL for Phases 07–12 was executed** against a local throwaway Postgres —
  all 20 migrations apply from scratch, deletion clears every table including
  the billing ones, rate limiting holds under concurrency, replayed webhook
  events are rejected, and generation is idempotent — but never against your
  project.

---

## Suggested order

1. §2 apply migrations (unblocks the most)
2. §3 integration tests
3. §5 email
4. §1 backup and restore
5. §7 domain
6. §4 confirm cron
7. §8 Search Console
8. §6 push
9. §9 AdSense, last
10. §12 assistant — one key, and it unblocks OCR too
11. §11 payments — independent of the rest, and the slowest to start
