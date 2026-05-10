---
owner: Clayton
last_reviewed: 2026-05-10
source_of_truth_for: LabelWatch product operating contract — extends IDE constitution + Shell Corp playbook
supersedes: null
---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know


> **Why this exists.** Entry point for any agent in the LabelWatch product repo (Next.js + Supabase). Inherits IDE constitution and the Shell-Corp launch playbook; product-specific rules below. The auto-generated `nextjs-agent-rules` block follows the frontmatter.

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# LabelWatch — Product Operating Contract

FDA recall intelligence for supplement brands. Monitors openFDA food-enforcement feed, matches recalls to customer firm/ingredient profiles, delivers alerts via email/Slack/webhook.

Inherits: IDE constitution (`~/IDE/AGENTS.md`) + Shell Corp launch playbook (`infra/runbooks/shell-corp-product-launch.md`). Rules here add product-specific operational detail only — they do not override inherited rules.

---

## 1. Architecture at a Glance

| Layer | Technology | Location |
|---|---|---|
| Frontend + API routes | Next.js 15 (App Router, Node runtime) | Vercel — `label.watch` (prod), `staging.label.watch` (preview) |
| Database | Supabase (Postgres + RLS) | `shellcorp-labelwatch` (prod, ref `ulypsprgdsasaxtjovtd`) |
| Staging DB | Supabase (Postgres + RLS) | `shellcorp-labelwatch-test` (staging, ref `luuepydfyqioluizjlml`) |
| Payments | Stripe (test mode on staging, live on prod) | Customer Portal + Checkout |
| Email delivery | Resend | `label.watch` domain, from `noreply@label.watch` |
| Slack delivery | Slack Incoming Webhooks + OAuth | Per-customer webhook URLs |
| SFP OCR / listing analysis | Anthropic API (`claude-sonnet-4-6`) | Called inline from Vercel function on `/api/audit/run` |
| Cron triggers | UptimeRobot + Vercel cron | Hits `/api/cron/poll`, `/api/cron/match`, `/api/cron/deliver`, `/api/cron/digest` |
| Deployment pipeline | CRM (`crm init` → `crm run` → `crm checkpoint` → `git push`) | `infra/scripts/crm/` |

---

## 2. Environments

| Environment | URL | Supabase ref | Stripe mode | Branch |
|---|---|---|---|---|
| Production | `https://label.watch` | `ulypsprgdsasaxtjovtd` | live | `main` |
| Staging | `https://staging.label.watch` | `luuepydfyqioluizjlml` | test | `staging` |

Staging is a Vercel preview deployment on the `staging` branch. Vercel-managed DNS handles the `staging.label.watch` subdomain via wildcard ALIAS — Namecheap CNAME is a no-op for this subdomain (see runbook §14.4).

---

## 3. External Dependencies & Credentials

All secrets live in 1Password **System** vault. `op item get "<name>" --vault System --fields <field> --reveal` to fetch.

### 3.1 Supabase

| Env var | Purpose | 1Password item | What breaks when missing |
|---|---|---|---|
| `SUPABASE_URL` | DB endpoint | `labelwatch_supabase_db_key` → `SUPABASE_URL` (prod) | Every DB read/write — app completely non-functional |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB auth (bypasses RLS) | `labelwatch_supabase_db_key` → `SUPABASE_SERVICE_ROLE_KEY` (prod) | Every DB read/write — app completely non-functional |

Staging equivalents: `labelwatch_supabase_test` (notesPlain contains `Service role:` field).

Prod ref `ulypsprgdsasaxtjovtd`, staging ref `luuepydfyqioluizjlml`. Both on us-east-1. 14 tables, migrations 001–008 applied to both (in sync). RLS: service_role only on all tables.

### 3.2 Stripe

| Env var | Purpose | 1Password item | What breaks when missing |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Checkout session creation, portal, webhook validation | `labelwatch_stripe_live_key` (prod) / Stripe test key in `labelwatch_supabase_test` notes (staging) | Checkout → 500; portal → 500; webhook signature fails |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | Same items (whsec_... field) | All webhook events ignored → no subscription_events rows → no customer provisioning |
| `STRIPE_PRICE_STARTER` | $39/mo Starter price ID | `Stripe LabelWatch Products` (1P notes) | POST /api/checkout {tier:starter} → 500 |
| `STRIPE_PRICE_PRO` | $99/mo Pro price ID | Same | POST /api/checkout {tier:pro} → 500 |
| `STRIPE_PRICE_TEAM` | $299/mo Team price ID | Same | POST /api/checkout {tier:team} → 500 |

Staging uses Stripe **test** mode (sk_test_51TNxMy...). Staging webhook endpoint: `we_1TT6oADOTEu9ivZxAnFLPu5v`. Test cards: 4242... (success), 4000...0002 (decline), 4000...0069 (expired), 4000...9995 (insufficient), 4000...3184 (3DS).

### 3.3 Anthropic (audit feature only)

| Env var | Purpose | 1Password item | What breaks when missing |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Claude Sonnet vision (SFP OCR) + text extraction (listing analysis) on `/api/audit/run` | `Anthropic API Key` → `credential` in System vault | `/api/audit/run` → 500 `audit_failed: missing ANTHROPIC_API_KEY` (key absent) or `credit balance too low` (key present, $0 credits) |

**Billing model:** Anthropic credits are workspace-level (shared across all API keys on the account). The active key is `novique-api-key` in platform.anthropic.com. Two calls per audit run: one vision call (SFP image OCR) + one text call (listing extraction), both `claude-sonnet-4-6` at 2048 max tokens. Estimated cost: ~$0.01–0.03 per audit run depending on SFP complexity.

**To fund:** platform.anthropic.com → Billing → Add credits. Credits are prepaid; the API returns `400 credit balance too low` when exhausted, which surfaces as `500 audit_failed` to the customer.

**Incident (2026-05-09):** Staging Anthropic credits exhausted during QA run `fbd011e4`. TC-AUDIT-002 (Pro quota test) returned 500 on the 10th call. Fix: add credits at platform.anthropic.com. No key rotation needed.

### 3.4 Session & Token Secrets

| Env var | Purpose | 1Password item | What breaks when missing |
|---|---|---|---|
| `CUSTOMER_SESSION_SECRET` | HMAC-SHA256 signs the `lw_customer` cookie (customer auth) | `labelwatch_customer_session_secret` (prod), `labelwatch_customer_session_secret_staging` (staging) | All authenticated routes (`/account`, `/api/audit/run`, `/api/account/*`) → 307 redirect to home; existing sessions invalidated |
| `LABELWATCH_AUDIT_TOKEN_SECRET` | HMAC-SHA256 signs audit access tokens minted on `/account` render | `labelwatch_audit_token_secret` (prod), `labelwatch_audit_token_secret_staging` (staging) | `/audit?t=...` → 307 redirect; customers can't access audit surface |
| `LABELWATCH_INVITE_TOKEN_SECRET` | HMAC-SHA256 signs Team org invite tokens | Not in 1P (set directly in Vercel) — **gap: should be added to 1P** | Team invite flow broken; `/api/accept-invite` → 401 |
| `CRON_SECRET` | Auth token for all `/api/cron/*` endpoints | `labelwatch_cron_secret_staging` (staging prod item not yet in 1P — **gap**) | All cron jobs → 401; no polling, matching, delivery, or digest |

**Secret rotation:** Rotating `CUSTOMER_SESSION_SECRET` invalidates all active customer sessions (forces re-login via Stripe Checkout). Rotating `LABELWATCH_AUDIT_TOKEN_SECRET` invalidates all outstanding audit links (customers get a fresh one on next `/account` load — 15min TTL by design). Rotate both in Vercel + 1P together.

### 3.5 Resend (email delivery)

| Env var | Purpose | 1Password item | What breaks when missing |
|---|---|---|---|
| `RESEND_API_KEY` | Sends recall alert emails + digest emails + contact form notifications | `RESEND_API_KEY` in System vault | Email channel deliveries fail silently (delivery_jobs → dead_letter); contact form 500s |
| `CONTACT_EMAIL_TO` | Destination for contact form submissions | Hardcoded `support@novique.ai` in Vercel | Contact form emails go to wrong address |
| `CONTACT_EMAIL_FROM` | Sender identity on contact form emails | Hardcoded in Vercel | Resend rejects if domain not verified |

Domain `label.watch` must be verified in Resend dashboard for `noreply@label.watch` to send. Resend → Domains → `label.watch` → DNS records must be present at Namecheap/Vercel DNS.

### 3.6 Slack OAuth

| Env var | Purpose | 1Password item | What breaks when missing |
|---|---|---|---|
| `SLACK_CLIENT_ID` | Slack OAuth app identifier | `labelwatch_slack_oauth` → `client_id` | "Connect Slack" button → OAuth init fails → 500 |
| `SLACK_CLIENT_SECRET` | Slack OAuth app secret | `labelwatch_slack_oauth` → `client_secret` | OAuth callback → 400 (can't exchange code for token) |

Slack app redirect URIs (must be registered in Slack app dashboard):
- Production: `https://label.watch/api/slack/oauth/callback`
- Staging: `https://staging.label.watch/api/slack/oauth/callback`

### 3.7 URLs & Feature Flags

| Env var | Purpose | Prod value | Staging value |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical base URL — used in Stripe success_url and email links | `https://label.watch` | `https://staging.label.watch` |
| `LABELWATCH_PUBLIC_URL` | Public URL for token-gated invite/audit links | `https://label.watch` | `https://staging.label.watch` |
| `NEXT_PUBLIC_LIVE_CHECKOUT` | `true` = show checkout CTAs; falsy = show waitlist form | `true` | `true` |

**§13.5 invariant:** `NEXT_PUBLIC_SITE_URL` must never be `localhost` in any deployed environment. The `resolveOrigin()` function in `app/api/checkout/route.ts` falls back to `NEXT_PUBLIC_SITE_URL` when no `Origin` header is present. If this is unset or localhost, Stripe success_url will point at localhost and customers won't land on `/onboard` after checkout.

---

## 4. Deployment

Uses the CRM pipeline. Governed repo — pushes are gated.

```bash
# Standard release
crm init              # initialise release
crm run               # lint + test + smoke
crm checkpoint        # lock the release
git push              # push gate checks CHECKPOINTED state
```

Staging (`staging` branch) and production (`main` branch) are both Vercel auto-deploy targets. Migrations must be applied to the target Supabase project before the code push — the CRM `run` phase checks for un-applied migrations.

**Staging-first doctrine (locked 2026-05-06):** every code change goes to `origin/staging` first. Run QA (`/qa-run projects/labelwatch/qa/test-plan.yaml`) against `staging.label.watch`. Operator confirms GREEN (or accepts known-skip reasons). Then merge to `main` and push to production. Migrations apply to prod Supabase before the main push.

---

## 5. QA

Test plan: `projects/labelwatch/qa/test-plan.yaml` (generated by `/qa-plan labelwatch`).

Run: `/qa-run projects/labelwatch/qa/test-plan.yaml`

Last run: `2a6f408e-ee34-4fa4-a5f9-2c2e5c314ea1` (2026-05-10) — **GREEN** ✅. 60/64 pass, 0 fail, 0 anomaly, 4 skip. Run file: `infra/scripts/shell-corp/qa/runs/labelwatch-2a6f408e-ee34-4fa4-a5f9-2c2e5c314ea1.json`.

Skips (all acceptable): TC-CHECKOUT-004 (3DS modal timeout in headless browser — API gate confirmed 200), TC-AUDIT-002 in starter batch (Pro tier, tested in pro-happy-path batch), TC-TEAM-002 (seat-cap precondition: org needs 5 members), NEG-APIKEY-CROSS-CUSTOMER (no API keys in staging after team cleanup — skip per test plan).

**Promotion gate:** QA must return GREEN before any merge to `main`.

---

## 6. Known Gaps & Open Bugs

| Bead | Description | Priority |
|---|---|---|
| `infrastructure-exje` | Pro/Team tiers hidden on frontend + rejected server-side. Re-enables when azn9 epic closes. | P1 |
| `infrastructure-u9xy` | `POST /api/onboard` returns `400 invalid_session_id` for already-onboarded customers instead of `200 {already_onboarded:true}` (§14.1). | P2 |
| `infrastructure-bksz` | `match_reason=ingredient_category` on DBA alias recalls — confirm firm-alias resolution attribution is correct. | P2 |
| `infrastructure-lrlz` | Stripe Link autofill contaminates Playwright QA decline-card tests. | P3 |
| `infrastructure-xzuz` | Cadence split (Starter digest vs Pro/Team realtime) — bead still open; TC-DELIVERY-006 and TC-DIGEST-002 skipped until Pro/Team available. | P1 |

### Credential gaps (1Password)

- `LABELWATCH_INVITE_TOKEN_SECRET` — set in Vercel but not in 1Password. If this needs to be rotated or recovered, it must be read from the Vercel dashboard manually.
- `CRON_SECRET` (production) — staging version is in 1P as `labelwatch_cron_secret_staging`; production version is not confirmed in 1P. Verify and add if missing.

---

## 7. Incident Log

| Date | Symptom | Cause | Fix |
|---|---|---|---|
| 2026-05-09 | `/api/audit/run` → `500 audit_failed: credit balance too low` on staging | Anthropic workspace credits exhausted (`novique-api-key` key, platform.anthropic.com) | Added credits at platform.anthropic.com → Billing |
| 2026-05-03 | `staging.label.watch` not reachable after domain setup | Vercel SSO protection (`ssoProtection: all_except_custom_domains`) still gating preview-target custom domains | PATCH `ssoProtection: null` via Vercel REST API |
| 2026-05-01 | `/onboard`, `/audit`, `/contact` rendered as transparent text on dark body after v4 redesign | v4 redesign dropped legacy Tailwind tokens (`--color-paper`, `--color-ink`, etc.) from `globals.css` | Redefined legacy tokens in `@theme inline` as v4 dark equivalents — commit `9d512e8` |
