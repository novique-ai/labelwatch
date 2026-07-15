---
owner: Clayton
created: 2026-07-15
last_reviewed: 2026-07-15
source_of_truth_for: LabelWatch marketing readiness — hard gate before any real-customer or paid acquisition push
status: BLOCKED — do not market
---

# LabelWatch — Do Not Market Checklist

**Rule:** Marketing (Product Hunt, LinkedIn, cold outreach, paid ads, “we’re live” claims) is **blocked** until every **Must-pass** item below is checked off with live evidence.  
**Owner:** product operator + agent fixing beads named in each row.

**Related beads (filed 2026-07-15 QA):**

| Bead | Priority | Topic |
|------|----------|--------|
| `infra-psc1` | P0 | Matcher + deliver crons dead since 2026-05-11 |
| `infra-lodo` | P0 | Email-only account sign-in (not real auth) |
| `infra-2dfr` | P1 | Synthetic “71+ hours ahead” proof claims |
| `infra-79c9` | P1 | Starter Email+Slack claim vs channel cap 1 |
| `infra-hyw8` | P1 | Missing Privacy / Terms pages |
| `infra-l80p` | P1 | Next.js high CVEs (16.2.4 → patched) |
| `infra-ly15` | P1 | Formal QA stale (last GREEN 2026-05-10) |
| `infra-mzd4` | P2 | og:image + security headers |

**How to mark done:** set `Status` to `PASS` and add one line of evidence (timestamp + command/URL/row id). Never mark PASS from staging alone if the claim is about production.

---

## Verdict banner (update when gates move)

| Date | Verdict | Notes |
|------|---------|--------|
| 2026-07-15 (post-ship) | **DO NOT MARKET** | M1–M4 largely remediated in prod (`9438001`); remaining: M1.5 inbox confirm, M5 Next CVEs, M6 full QA, Should-pass polish |
| 2026-07-15 | **DO NOT MARKET** | Partial remediation in flight — pipeline restored ops-side; code fixes not yet all in production |
| 2026-07-15 (start) | **DO NOT MARKET** | Alert pipeline dead; auth MVP; synthetic proof; no legal pages; QA stale |

When all Must-pass items are PASS: change verdict to **CLEAR TO MARKET** and record the date + who signed off.

---

## Must-pass (blocking)

### M1 — Alert pipeline alive in production (`infra-psc1`)

- [x] **M1.1** UptimeRobot (or equivalent) fires **GET** (not HEAD-only) to:
  - `/api/cron/poll?cron_secret=…` every ≤5 min — **PASS** (UR + poller_runs)
  - `/api/cron/match?cron_secret=…` every ≤5 min — **PASS** via clay-blade `labelwatch-cron.timer` (UR match monitor still unverified)
  - `/api/cron/deliver?cron_secret=…` every ≤1–5 min — **PASS** via same timer
  - `/api/cron/digest` daily (Vercel cron `0 9 * * *` or external) — still verify after next 09:00 UTC
- [x] **M1.2** `poller_runs` shows recent `status=ok` (last 15 min)
- [x] **M1.3** `matcher_runs` shows at least one successful run **after** the fix date (not stuck at 2026-05-11) — run `d8f8ded7…` 2026-07-15
- [x] **M1.4** A new or reprocessed recall produces `delivery_jobs` with terminal `sent` — 8 jobs `sent` 2026-07-15
- [ ] **M1.5** End-to-end proof: one real channel (email or Slack) for a known test profile receives an alert within the tier’s cadence claim — **confirm inbox/Slack for mark@how3ll.net**

**Evidence log:**

| When | What | Result |
|------|------|--------|
| 2026-07-15 | Pre-fix audit | Poller OK (~283/24h). Matcher last 2026-05-11. delivery_jobs last 2026-05-10. |
| 2026-07-15 | Manual prod match+deliver | match scanned=4 matched=2 jobsEmitted=8; deliver sent=8; watermark → 2026-07-14 |
| 2026-07-15 | clay-blade `labelwatch-cron.timer` | Enabled; oneshot match+deliver HTTP 200 (scanned=0 after catch-up) |
| 2026-07-15 | 1P | Created `labelwatch_cron_secret` (prod) |
| pending | Code deploy | HEAD handlers for match/deliver/digest must ship so any UR HEAD probes also run workers |

### M2 — Account access is real auth (`infra-lodo`)

- [x] **M2.1** `/api/account/signin` does **not** grant a session cookie on email alone — prod smoke 2026-07-15
- [x] **M2.2** Magic link (or equivalent) required; link expires (15m HMAC); single-use preferred — **TTL yes; single-use not enforced** (acceptable for v1)
- [x] **M2.3** No email-enumeration UX — always `{ok:true,status:check_email}`
- [x] **M2.4** Session cookie remains HttpOnly + Secure + SameSite (callback path); rotation still via Vercel+1P

### M3 — Marketing claims are true (`infra-2dfr`, `infra-79c9`)

- [x] **M3.1** Homepage “Proof / N hours ahead” removed — “From the wire · recent FDA…” + report dates
- [x] **M3.2** Starter tier copy matches enforcement — `TIER_CHANNEL_CAP.starter=2`
- [x] **M3.3** Pro/Team “within minutes” — match+deliver cron restored (timer); continue monitoring freshness
- [x] **M3.4** TIC / Amazon citations — vitest guard still green (101+ tests)

### M4 — Legal / trust minimum (`infra-hyw8`)

- [x] **M4.1** Public `/privacy` live (prod 200)
- [x] **M4.2** Public `/terms` live (prod 200)
- [x] **M4.3** Footer links both (+ sitemap)

### M5 — Security baseline (`infra-l80p`, partial `infra-mzd4`)

- [ ] **M5.1** Production Next.js on patched release (audit clean for known high Next advisories at ship time)
- [ ] **M5.2** `npm audit --omit=dev` reviewed; no untriaged **high** in prod dependency tree without explicit accept risk note

### M6 — Formal QA green on current HEAD (`infra-ly15`)

- [ ] **M6.1** Full `qa/test-plan.yaml` run against **staging** GREEN (or documented accepted skips only)
- [x] **M6.2** Staging + main at `9438001` (CRM checkpoint green, pushed)
- [x] **M6.3** Smoke prod: privacy/terms/claims/magic-link/HEAD-cron — partial (full suite still M6.1)

---

## Should-pass before big push (not blocking a quiet soft open)

### S1 — Social / SEO polish (`infra-mzd4`)

- [ ] **S1.1** `og:image` (+ twitter image) on homepage
- [ ] **S1.2** Security headers: at least `X-Content-Type-Options`, `Referrer-Policy`, frame denial or CSP baseline

### S2 — Ops durability

- [ ] **S2.1** Prod `CRON_SECRET` in 1Password System vault (not Vercel-only)
- [ ] **S2.2** UptimeRobot API key in 1Password; monitor inventory documented
- [ ] **S2.3** AGENTS.md Known Gaps + migration list (001–013) updated

### S3 — Auth UX polish

- [ ] **S3.1** Sign-in form contrast readable on dark homepage
- [ ] **S3.2** `/account/compliance` unauth redirects to `/?account=signin` (consistent with `/account`)

---

## Explicitly forbidden claims until gates pass

Do **not** publish:

1. “Alerts within minutes of FDA publication” — until M1.5 PASS for Pro/Team realtime path  
2. “Daily digest” as a working Starter feature — until digest cron + M1 path proven  
3. “We caught these 71+ hours ahead” / synthetic lead-time badges — until M3.1 PASS  
4. “Secure account login” / “My Account” as trustworthy multi-tenant security — until M2 PASS  
5. “Live / launched / ready for customers” in acquisition channels — until **all Must-pass** PASS  

Allowed while blocked (optional, careful wording):

- “In private beta / building in public”  
- “Taking design-partner conversations” via `/contact`  
- Technical blog that does **not** claim live alert SLOs  

---

## Work log (agents append)

| Date | Agent | Action | Bead / gate |
|------|-------|--------|-------------|
| 2026-07-15 | Grok QA | Full prod QA; filed beads; cleaned QA detritus (2 contact_messages, 2 signups, 6 open live Checkout sessions expired) | — |
| 2026-07-15 | Grok | Checklist created; begin M1 pipeline restore | `infra-psc1` |
| 2026-07-15 | Grok | Prod match+deliver catch-up; 1P cron secret; clay-blade 5m timer | M1 / `infra-psc1` |
| 2026-07-15 | Grok | Code: HEAD→worker for match/deliver/digest; remove synthetic Proof hours; starter channel cap=2; magic-link sign-in; /privacy + /terms; compliance redirect | M1–M4 / `infra-lodo` `infra-2dfr` `infra-79c9` `infra-hyw8` |

---

## Sign-off (only when Must-pass complete)

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Operator | | | CLEAR TO MARKET |
| Engineering evidence | | | All M* PASS with logs linked |
