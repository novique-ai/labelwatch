# LabelWatch MVP Roadmap

**Purpose.** Single source of truth for what's in MVP1 (currently shipping) vs MVP2 (known future work, already decided on direction but deferred). Updated every session.

**Scope.** The LabelWatch customer-facing product (Next.js app + Supabase project `shellcorp-labelwatch`). Governed by the Shell Corp product-delivers gate (runbook §6.0) — live checkout (`NEXT_PUBLIC_LIVE_CHECKOUT=true`) does not flip until MVP1 is fully shipped and audited.

**Update discipline.** Every session that touches the labelwatch product MUST end with this file in sync:
1. Move anything just-shipped from MVP1 "In flight" to MVP1 "Shipped"
2. Add any newly-identified MVP2 items with a one-line rationale
3. Update the changelog at the bottom
4. Commit in the same PR as the code change

---

## Status dashboard

| Capability | Bead | Status |
|---|---|---|
| openFDA poller + firm normalization | `infrastructure-zxv3` | ✅ Shipped 2026-04-22 |
| Contact form + API (Supabase + Resend) | `infrastructure-2auk` | ✅ Shipped 2026-04-23 |
| Customer profile schema + `/onboard` | `infrastructure-p4zb` | 🟡 Code landed 2026-04-23 (awaiting relaunch to exercise) |
| Matcher + severity routing | `infrastructure-xv3f` | ⬜ Blocked by p4zb |
| Delivery pipeline (Slack/Teams/HTTP/email) | `infrastructure-vlm7` | ⬜ Blocked by p4zb, xv3f |
| History + search UI | `infrastructure-o4n7` | ⬜ Blocked by zxv3 (unblocked) |
| Team-tier CSV + REST API + API keys | `infrastructure-2mkx` | ⬜ Blocked by p4zb |
| Test-subscriber mode | `infrastructure-vg99` | ⬜ Not started |
| Validation + gap-fix sweep | `infrastructure-r7d5` | ⬜ Pre-relaunch |
| Listing Copy Audit (lcaudit) | `infrastructure-sl26` | 🟡 Code landed 2026-04-25 (awaiting relaunch + Supabase migration apply to exercise) |
| Daily "FDA Today for Supplements" digest | `infrastructure-uihh` | ⬜ Reuses zxv3 poller; ships in §5.5 of GTM plan |
| Re-enable checkout + strip pilot language | `infrastructure-9ewv` | ⬜ Relaunch trigger (now also blocked by sl26) |
| SEO foundations | `infrastructure-t3w4` | ⬜ Ships WITH relaunch commit |
| Marketing launch burst | `infrastructure-gc8o` | ⬜ Post-relaunch |

---

## Capability: Customer profile schema + `/onboard` (p4zb)

**Charter:** 3-build. **Parent EPIC:** `infrastructure-w0yt`.

### MVP1 — shipping in this bead

**Data model (three new tables + migration `sql/005_customers.sql`)**

- `customers`
  - `id uuid PK default gen_random_uuid()`
  - `stripe_customer_id text UNIQUE NOT NULL` — natural key, idempotent upsert target
  - `email text NOT NULL`
  - `firm_name text NOT NULL` — display-name as entered on Stripe Checkout
  - `tier text NOT NULL CHECK (tier in ('starter','pro','team'))`
  - `onboarding_completed_at timestamptz NULL` — hard gate for delivery
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`

- `customer_profiles`
  - `id uuid PK`
  - `customer_id uuid NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE` — 1:1 with customer for MVP1
  - `firm_id uuid REFERENCES firms(id) ON DELETE SET NULL` — resolved via existing `findOrCreateFirm()`
  - `firm_aliases text[] NOT NULL DEFAULT '{}'` — customer-submitted DBAs/aliases (provenance)
  - `ingredient_categories text[] NOT NULL DEFAULT '{}'` — closed-enum via CHECK constraint (see below)
  - `severity_preferences jsonb NOT NULL DEFAULT '{}'` — per-channel routing shape, see MVP1 schema below
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`

- `customer_channels`
  - `id uuid PK`
  - `customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE`
  - `type text NOT NULL CHECK (type in ('slack','teams','http','email'))`
  - `config jsonb NOT NULL` — type-specific shape (see below)
  - `enabled boolean NOT NULL DEFAULT true`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`

**Closed enums (MVP1)**

- `customer_profiles.ingredient_categories` values: `protein`, `vitamins`, `minerals`, `herbals_botanicals`, `probiotics`, `sports_nutrition`, `weight_management`, `amino_acids`, `omega_fatty_acids`, `pre_workout`, `childrens`, `other`. Multi-select.
- `customer_channels.type` values: `slack`, `teams`, `http`, `email`.

**`severity_preferences` jsonb shape (MVP1)**

```json
{
  "default_min_class": "II",
  "per_channel": {
    "<channel_id>": { "min_class": "I" | "II" | "III" }
  }
}
```

`default_min_class` covers any channel without an override. `per_channel` is optional.

**`customer_channels.config` jsonb shape per type (MVP1)**

- `slack`:   `{ "webhook_url": "https://hooks.slack.com/..." }`
- `teams`:   `{ "webhook_url": "https://outlook.office.com/..." }`
- `http`:    `{ "url": "https://...", "auth_header": "Bearer ..." | null }`
- `email`:   `{ "address": "alerts@firm.com" }`

Validation lives at the delivery-adapter layer (`infrastructure-vlm7`) — schema just stores the blob.

**RLS:** enabled on all three tables, no policies. Service-role bypasses. Matches existing convention.

**Routes / code**

- `app/onboard/page.tsx` — Server Component; on mount, retrieves Stripe Checkout session from `?session_id=...`, reads email + customer ID + tier, hands them to client form component as initial state.
- `app/onboard/onboard-form.tsx` — Client Component; three-step controlled form:
  1. **Firm identity** — firm name (prefilled from Stripe), DBAs/aliases (chip input)
  2. **Scope** — ingredient categories (checkbox multi-select), severity preferences (default min class for v1; per-channel override in step 3)
  3. **Delivery** — first channel: type select → type-specific config form → enable toggle
- `app/api/onboard/route.ts` — POST handler; re-validates `session_id` server-side, upserts `customer_profiles`, inserts `customer_channels`, appends to `firms.aliases`, stamps `customers.onboarding_completed_at = now()`.
- `app/api/stripe/webhook/route.ts` — extended to handle `checkout.session.completed` → upsert skeleton `customers` row (stripe_customer_id, email, firm_name from session, tier from metadata). Uses 23505 idempotent-retry pattern.
- `app/api/checkout/route.ts` — change `success_url` from `/?checkout=success&session_id=...` to `/onboard?session_id=...`.
- `lib/customers.ts` — new module for customer upsert + profile helpers. Mirrors the pattern in `lib/firms.ts` (race-safe on 23505).
- `lib/firms.ts` — extend `findOrCreateFirm()` to optionally append new aliases to existing rows (closes the known gap).
- `types/database.types.ts` — hand-authored typed shape for the new tables (full CLI-generated file is MVP2).

**Auth model (MVP1)**

- Pure `session_id` trust. `/onboard` page and `/api/onboard` both retrieve the Stripe session server-side to get the customer identity. Form submit does NOT carry email/customer_id in body — it's always re-derived from `session_id`. Simple, no auth infra.

**Delivery gate (MVP1)**

- Matcher (`xv3f`) and delivery (`vlm7`) will filter:
  ```sql
  WHERE customers.onboarding_completed_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM customer_channels WHERE customer_id = customers.id AND enabled = true)
  ```

### MVP1 out-of-scope / explicit exclusions (documented so nobody adds them)

- Customers cannot edit their profile after initial submit (edit flow = MVP2).
- Only one channel of each type at onboarding time (multi-channel = MVP2).
- No multi-user/seat support under one `stripe_customer_id` (Team tier = single identity for MVP1).
- No magic-link email as auth fallback.
- No automatic firm-entity merging (alias normalization stays manual).
- No telemetry on onboarding funnel (drop-off tracking = MVP2).

### MVP2 — known future work (NOT in this bead)

| Item | Rationale |
|---|---|
| Supabase CLI adoption + `supabase gen types` in CI | Hand-authored types don't scale past a few tables. Adopt once schema stabilizes. |
| HMAC-signed onboarding token | `session_id` alone is fine at pilot scale but gets replay-attackable at volume. Add signed-nonce query param. |
| Multi-user / team seats | Team tier ($299) implies multiple operators per firm. Needs `team_memberships` table + Supabase Auth (or equivalent). |
| `/account` edit-profile flow | Customers will want to change ingredient categories, rotate webhook URLs. |
| `ingredient_categories` as lookup table | Once list grows past ~20 or per-category metadata matters (e.g., per-category severity defaults). |
| Magic-link email fallback | For customers who close the tab before hitting `/onboard`. Triggered from webhook. |
| Multiple channels of same type | Enterprise customers want dev-alerts channel + exec-alerts channel separately. |
| Per-channel severity overrides UI | Schema (`severity_preferences.per_channel`) already supports it; MVP1 only writes `default_min_class`. |
| Onboarding funnel telemetry | Step drop-off tracking to optimize completion rate. |
| Test-subscriber mode hooks | Bead `vg99` — operator validation path without real charge. |
| Edit-firm-aliases in `/account` | Customers discover new DBAs over time. |
| Support `http` channel OAuth bearer rotation | Beyond static `auth_header` string. |
| Atomic `appendFirmAliases` via RPC | Current implementation is read-modify-write; two concurrent onboardings resolving to the same firm can drop one side's aliases. Low risk at pilot scale. Fix: `UPDATE firms SET aliases = array(SELECT DISTINCT unnest(aliases \|\| $1)) WHERE id = $2` via a SECURITY DEFINER function. |

---

## Capability: Matcher + severity routing (xv3f)

**Status:** blocked by p4zb. MVP1 scope TBD. Placeholder for future session.

## Capability: Delivery pipeline (vlm7)

**Status:** blocked by p4zb + xv3f. MVP1 scope TBD.

## Capability: History + search UI (o4n7)

**Status:** unblocked. MVP1 scope TBD.

## Capability: Team-tier surfaces (2mkx)

**Status:** blocked by p4zb. MVP1 scope TBD.

## Capability: Listing Copy Audit (lcaudit)

**Charter:** 3-build. **Parent EPIC:** `infrastructure-w0yt`. **Bead:** `infrastructure-sl26`. **Added:** 2026-04-25 per T1.2 R4 (Xpoz-augmented LabelWatch demand re-validation).

### Why this capability now (Amazon-TIC-driven)

Per T1.2 §2A, Amazon's 2026 TIC expansion includes **AI-driven scans of A+ content / brand-site / Supplement Facts Panel for language drift** — listings whose marketing copy contradicts the SFP get deactivated as of March 31, 2026. Sellers report this is the harder half of compliance (vs. lab testing) because copy drifts over time across multiple surfaces. A "Listing Copy Audit" feature that diffs SFP image text against listing copy is the natural product-side answer — and it's the wedge that justifies LabelWatch's relaunch announcement leading with Amazon-listing-protection (T1.2 R1).

### MVP1 scope (lcaudit, 12-18 hours)

**Inputs (per-customer):**
- Supplement Facts Panel **image** (PNG/JPG/PDF) — uploaded by customer at onboarding or via dashboard
- Listing copy **text** — pasted Amazon A+ HTML, brand-site URL, or raw paste (single channel for MVP1)

**Pipeline:**
1. SFP image → OCR (Tesseract first; Claude Vision fallback if Tesseract confidence <0.7)
2. Normalize SFP text into structured form: ingredient list + claims + serving size + warnings
3. Listing-copy text → tokenize claims + ingredient mentions
4. Diff: flag claims in listing not present in SFP + SFP claims not surfaced in listing
5. Audit report: severity-ranked findings, exportable PDF

**Storage:**
- `audit_runs` table: customer_id, sfp_image_storage_url, listing_text_hash, run_at, finding_count, severity_max
- `audit_findings` table: run_id, finding_type ('claim_drift' | 'ingredient_mismatch' | 'missing_warning'), severity ('low' | 'medium' | 'high'), excerpt, line_number_in_listing
- RLS: customer_id-scoped; service-role bypass.

**Routes:**
- `app/audit/page.tsx` — Server Component; lists customer's prior audit runs.
- `app/audit/new/page.tsx` — upload-form Client Component (SFP + paste listing).
- `app/api/audit/run/route.ts` — POST handler that orchestrates OCR + diff, returns audit_run_id.
- `app/audit/[run_id]/page.tsx` — finding-by-finding viewer + PDF export.

**Auth model (MVP1):** Logged-in customer required (post-onboarding session). Tier-gated: 1 audit/mo on starter ($39), 10/mo on pro ($99), unlimited on team ($299).

**Cut-line if over budget:** Drop the brand-site crawl entirely; ship only SFP-image + paste-listing-copy. Defer Amazon API integration to MVP2.

### MVP1 out-of-scope / explicit exclusions

- Brand-site crawl (multi-page audit) — MVP2.
- Amazon Product API integration — MVP2.
- Scheduled re-audits (cron-style) — MVP2.
- Bulk audit (multiple SKUs at once) — MVP2; team-tier candidate.
- AI-suggested copy fixes — MVP2.

### MVP2 — known future work

| Item | Rationale |
|---|---|
| Brand-site crawl + multi-page diff | Amazon's AI scans brand-site too — full coverage for the buyer pain. |
| Amazon Product API integration (sync listing automatically) | Removes paste step, enables continuous monitoring — converts audit feature into a continuous-monitoring service. |
| Scheduled re-audits | Continuous "your listing drifted today" alerts. |
| Bulk audit | Team-tier multi-SKU scenario. |
| AI suggested fixes | "Here's what to change in your A+ copy to match the SFP." |
| TIC-lab partnership integration | When lcaudit is paired with a TIC referral, Mark gets a referral fee. |
| PDF export (server-side) | MVP1 ships browser ⌘P only. Server-side PDF deferred unless customers ask. |
| Tesseract OCR fallback | MVP1 uses Claude Vision direct (single code path). Tesseract becomes useful only if vision-call cost dominates. |
| PDF SFP uploads | MVP1 accepts PNG/JPEG only. PDF requires page-rasterize step. |
| Magic-link audit-access re-issuance | MVP1 emails one signed token at onboarding. If lost, support reissues manually. |
| `/account` page to rotate the audit token | Pairs with magic-link MVP2. |

### Code landed 2026-04-25 (awaiting relaunch to exercise)

- `sql/006_audit.sql` — `audit_runs` + `audit_findings` tables, RLS service-role-only.
- `lib/audit-token.ts` — HS256 sign/verify for `LABELWATCH_AUDIT_TOKEN_SECRET`.
- `lib/audit-storage.ts` — Supabase Storage helper, bucket `audit-sfp-images`, PNG/JPEG only, 10MB cap.
- `lib/audit-extract.ts` — Anthropic SDK calls (`claude-sonnet-4-6`); SFP image → `SfpExtract` and listing text → `ListingExtract` via tool-forced JSON.
- `lib/audit-diff.ts` — pure-fn diff (claim_drift / ingredient_mismatch / missing_warning), unit-tested.
- `lib/audit-runs.ts` — DB lifecycle (create→running→complete/failed), tier quota check (1/10/∞ in 30d window).
- `lib/audit-access.ts` — mints + emails the audit-access link at end of onboarding (non-fatal on failure).
- `lib/customers.ts` — `finalizeOnboarding` now calls `mintAndEmailAuditAccess` after stamping `onboarding_completed_at`.
- `app/api/audit/run/route.ts` — POST multipart, token-gated, inline orchestration with `maxDuration = 60`.
- `app/audit/page.tsx` + `app/audit/new/page.tsx` + `app/audit/new/audit-new-form.tsx` + `app/audit/[run_id]/page.tsx` — token-gated UI, print-friendly report.
- `lib/audit-diff.test.ts` — 8 vitest cases (`npm run test:run`).
- `.env.example` — `ANTHROPIC_API_KEY`, `LABELWATCH_AUDIT_TOKEN_SECRET`, `LABELWATCH_PUBLIC_URL`, `LABELWATCH_AUDIT_BUCKET` documented.
- `package.json` — `@anthropic-ai/sdk` runtime dep, `vitest` dev dep, `test` + `test:run` scripts.

**Pending operator follow-ups (NOT in this bead, do at relaunch time):**

1. Apply `sql/006_audit.sql` to the `shellcorp-labelwatch` Supabase project.
2. Add to Vercel production env: `ANTHROPIC_API_KEY` (1P → "Anthropic API Key"), `LABELWATCH_AUDIT_TOKEN_SECRET` (`openssl rand -hex 32`, store new 1P item), `LABELWATCH_PUBLIC_URL=https://label.watch`.
3. End-to-end smoke: complete onboarding with a test Stripe customer → verify access email arrives → click link → upload SFP image + paste listing → confirm findings render.

### Hard gates

- Lands as part of the 9ewv relaunch chain. `9ewv` is now blocked by `sl26`. Cannot flip `NEXT_PUBLIC_LIVE_CHECKOUT=true` without lcaudit shipped because the relaunch announcement leads with Amazon-listing-protection — selling the wedge requires shipping the wedge.

---

## Capability: Re-enable live checkout + relaunch (9ewv)

**Status:** not started. Triggered when every other MVP1 capability above is ✅ shipped.

### MVP1 prerequisites for this bead (hard gates — do not flip `NEXT_PUBLIC_LIVE_CHECKOUT=true` until all are true)

- All MVP1 capabilities listed in the dashboard above are ✅ Shipped (product-delivers gate per runbook §6.0).
- **CRM-init the labelwatch repo** as the first step of 9ewv. Today labelwatch is ungoverned (not in `guard-push.json`, no `.crm/config.sh`). That's defensible during build-phase Coming-Soon mode; it is NOT defensible once live checkout takes real money. At relaunch, run `crm init local` in `~/IDE/projects/labelwatch/`, wire `.crm/config.sh` with at least lint+build+schema-apply gates, and require `crm checkpoint → push` for every subsequent commit. Rationale: the Shell Corp product-delivers gate becomes enforceable by the pipeline (not just doctrine) once CRM is in place.
- Marketing language sweep — strip "pilot", "beta", "founding cohort" hedging per bead 9ewv description.
- SEO foundations (`infrastructure-t3w4`) land in the SAME commit as the relaunch flip — robots.txt, sitemap.xml, JSON-LD structured data. Crawlers must have day-one findability.

---

## Capability: Contact form (2auk)

**Charter:** 3-build. Shipped 2026-04-23.

**Why:** `hello@label.watch` on the marketing page was a dead mailto — no MX records on the domain. Replaced with a real contact surface so inbound from the "Talk to us" CTA and checkout-portal error path actually reaches an operator.

**Shipped:**
- `sql/004_contact_messages.sql` — `contact_messages` table with 7-value category enum, email delivery status tracking, service-role-only RLS.
- `lib/resend.ts` — minimal REST-API client + `URGENT_HEADERS` constant (X-Priority + Importance: high).
- `app/api/contact/route.ts` — POST handler that (1) persists the row first so no message is lost on email-send failure, (2) emails `CONTACT_EMAIL_TO` (default `support@novique.ai`) via Resend with subject `LabelWatch Customer Message — <category>` and urgent headers, (3) updates the row with `email_status` = sent|failed.
- `app/contact/page.tsx` + `app/contact/contact-form.tsx` — full contact form (name, email, firm, category dropdown, message) with honeypot anti-spam, styled to match the marketing page.
- `app/page.tsx` — "Talk to us" footer section now links `send us a message` → `/contact` instead of the dead mailto.
- `app/checkout-banner.tsx` — portal-error copy now points at `/contact`.
- `.env.example` — `RESEND_API_KEY`, `CONTACT_EMAIL_TO`, `CONTACT_EMAIL_FROM` documented.

**Operator follow-ups (not in this bead):**
- Verify `label.watch` in the Resend dashboard (DKIM/SPF) so `noreply@label.watch` sends cleanly. Until then, set `CONTACT_EMAIL_FROM=onboarding@resend.dev` for smoke-testing.
- Add `RESEND_API_KEY` + `CONTACT_EMAIL_*` to Vercel env (production).
- Apply `sql/004_contact_messages.sql` to the `shellcorp-labelwatch` Supabase project.

**MVP2 deferrals:**
- IP-hash rate-limiting beyond the honeypot.
- Admin view for `contact_messages` rows (currently read via Supabase dashboard).
- Auto-categorization / reply-template suggestion from LLM.

---

## Changelog

- **2026-04-30 (later)** — Phase 1 of the MVP1-relaunch sequence (locked plan, see Open Brain `da1e2a70-d376-4822-b14c-d08b57d5d616`; verification thought `9af674c8-1ac0-4bc8-91d1-c3176099dac8`) — foundation verification complete. Confirmed against production Supabase project `shellcorp-labelwatch` (ref `ulypsprgdsasaxtjovtd`): all 11 expected tables present (signups, recalls, firms, poller_runs, contact_messages, customers, customer_profiles, customer_channels, audit_runs, audit_findings, subscription_events). Migrations 001-006 all applied. lcaudit (`sl26`) data confirmed: 30 audit_findings rows from 5 prior smoke runs. The pre-existing SL26 smoke customer (`8899eb1e-986f-48de-b216-f0adc9dbbba4`, cus_UP4aI9so56qXjp, smoke-sl26@example.test) had `onboarding_completed_at` stamped but ZERO rows in `customer_profiles` / `customer_channels` — meaning the /onboard flow had never been exercised end-to-end. Seeded synthetic profile + slack channel for that customer (firm_aliases includes `phase1-onboard-seed` marker, ingredient_categories=protein+vitamins, severity_preferences.default_min_class=II, slack webhook URL deliberately invalid). Matcher-eligibility query (`onboarding_completed_at IS NOT NULL AND channels.enabled`) now returns the customer with full nested profile + channel — this is the exact input shape `xv3f` will consume. Real /api/onboard e2e (which requires a real Stripe checkout session) deferred to `infrastructure-vg99` (test-subscriber mode), which will inject synthetic recalls through the full chain once `vlm7` ships. **Phase 2 (xv3f matcher build) is now unblocked.**
- **2026-04-30** — Hero design pass via `/improve-ui` (design-agent), closing the open follow-up from the same-day copy swap. **BEFORE 31/50 → AFTER 39/50 (Δ +8)**, audited at both 1440×900 desktop and 375×812 mobile. Fixes: (a) mobile horizontal scroll (432px → 375px) by switching `s.sectionLabel.whiteSpace` from `nowrap` to `normal` + adding `overflowX: hidden` on the page container; (b) headline scale retuned for the 9-word sentence — desktop 88px→56px / `text-wrap: balance`, mobile 56px→40px (h1 height collapsed 418→171 desktop, 266→127 mobile, sub no longer orphaned); (c) above-the-fold message coherence — top-bar tagline, eyebrow, right-col pitch, sub-pitch, and recall-strip header all reframed from FDA-recall-only to TIC-primary-with-FDA-as-proof-of-detection. Files: `app/page.tsx` + `app/recall-strip.tsx`. Visual evidence: `~/IDE/infra/.playwright-mcp/labelwatch-{baseline,after}-{1440,375}.png`.
- **2026-04-30** — Hero copy swapped to the Amazon-2026-TIC framing (T1.2 re-frame). Headline: "Amazon's 2026 testing rule decides what stays on shelf." Sub: "LabelWatch scores every SKU against the new requirements — fix the gaps before takedowns hit Q4." Generated by `/copywrite` agent run `d6022028-c676-4dc8-9d6d-4e870abe8d66` (best_score 9.20, 4 iterations). FDA-recall-lag framing ("Three weeks behind." + co-packer Salmonella paragraph) retired from the lead position — long-tail moat narrative moves below-fold in a future pass. **Open follow-up:** the 88px right-aligned Instrument-Serif headline style was tuned for 3 short words; the longer 9-word headline will overflow the left-column width on standard desktop viewports — needs a design pass to re-fit (lower font-size or restructured break) before relaunch.
- **2026-04-25** — `sl26` code landed. Full audit pipeline (SQL → lib → API → UI → vitest) wired into the existing onboarding flow. Anthropic SDK + vitest added as deps. Design calls locked: Claude Vision direct (no Tesseract), HS256-signed `?t=` token (no login), hybrid LLM-extract + code-diff (explainable findings), no server-side PDF (browser ⌘P). Build + tests + tsc all clean. Awaiting relaunch (9ewv) to exercise.
- **2026-04-25** — Added `lcaudit` (Listing Copy Audit) as MVP1 capability per T1.2 R4 / Company-Factory 2026-04-25 refresh. New bead `infrastructure-sl26`. Added 9ewv block-by-sl26 dependency. Re-frames the entire relaunch announcement: leading claim becomes Amazon-listing-protection (Cluster 0 SEO target), not FDA recall. Reference: `~/IDE/infra/.planning/company-factory/research/05-labelwatch-xpoz-demand.md` + `plans/01-labelwatch-relaunch-gtm.md` §0 + §5.4 + §5.5.
- **2026-04-23** — Decided: ship p4zb + 2auk ungoverned now (labelwatch has no RM/CRM pipeline today); `crm init` labelwatch as the first step of the relaunch bead `9ewv`. Logged as an MVP1 prerequisite under the new 9ewv capability section. Rationale: Coming-Soon mode is the real gate during build-phase; adding CRM ceremony now would cost friction without proportional safety gain — but real-money traffic REQUIRES CRM governance, so relaunch cannot begin without it.
- **2026-04-23** — p4zb code landed: `sql/005_customers.sql` applied to `shellcorp-labelwatch`; `types/database.types.ts`, `lib/customers.ts`, `appendFirmAliases()` helper in `lib/firms.ts`, `/onboard` + `/onboard/complete` pages, `/api/onboard` POST handler, `checkout.session.completed` → customer-skeleton upsert in the webhook, `success_url` flipped to `/onboard?session_id=...`. Code review fixes folded in (duplicate-channel guard via DB unique index + app-level short-circuit, payment_status guard, alias normalization). End-to-end exercise waits for relaunch (bead `infrastructure-9ewv`); atomic alias RPC queued as MVP2.
- **2026-04-23** — Added `2auk` (contact form) as shipped. Replaces the dead `hello@label.watch` mailto on the marketing page and checkout-banner portal-error path with a real `/contact` form backed by Supabase + Resend.
- **2026-04-23** — Initial roadmap. p4zb MVP1 scope locked (schema + `/onboard` + webhook skeleton). MVP2 backlog seeded from Phase-3 clarifying-questions discussion.
