---
owner: Clayton
last_reviewed: 2026-08-26
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
| Database | Supabase (Postgres + RLS) | Supabase prod project (ref: private ops doc) |
| Staging DB | Supabase (Postgres + RLS) | Supabase staging project (ref: private ops doc) |
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
| Production | `https://label.watch` | (private) | live | `main` |
| Staging | `https://staging.label.watch` | (private) | test | `staging` |

Staging is a Vercel preview deployment on the `staging` branch. Vercel-managed DNS handles the `staging.label.watch` subdomain via wildcard ALIAS — Namecheap CNAME is a no-op for this subdomain (see runbook §14.4).

---
---

## 3. External Dependencies & Credentials

All runtime secrets live in a private vault. The per-variable credential
inventory (vault item names, project refs, webhook endpoints, test identifiers)
is internal — see the private ops doc in the infra repo:
`docs/products/labelwatch/credentials-ops.md`. The environment variables the
app needs are listed in `.env.example`.

### URLs & Feature Flags

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

Test plan: `qa/test-plan.yaml` — generated locally by `/qa-plan labelwatch`; internal QA artifact, not tracked in this repo.

Run: `/qa-run projects/labelwatch/qa/test-plan.yaml`

Last run: 2026-05-10 — **GREEN** ✅. 60/64 pass, 0 fail, 0 anomaly, 4 skip. (Run records are internal — private ops doc.)

Skips (all acceptable): TC-CHECKOUT-004 (3DS modal timeout in headless browser — API gate confirmed 200), TC-AUDIT-002 in starter batch (Pro tier, tested in pro-happy-path batch), TC-TEAM-002 (seat-cap precondition: org needs 5 members), NEG-APIKEY-CROSS-CUSTOMER (no API keys in staging after team cleanup — skip per test plan).

**Promotion gate:** QA must return GREEN before any merge to `main`.

---
## 6. Known Gaps & Open Bugs

Tracked in the internal work tracker. The current gap table and
credential-gap notes are internal — see the private ops doc:
`docs/products/labelwatch/credentials-ops.md` (infra repo).

---

## 7. Incident Log

Internal — see the private ops doc: `docs/products/labelwatch/credentials-ops.md` (infra repo).
