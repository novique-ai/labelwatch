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
| Re-enable checkout + strip pilot language | `infrastructure-9ewv` | ⬜ Relaunch trigger |
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

- **2026-04-23** — Decided: ship p4zb + 2auk ungoverned now (labelwatch has no RM/CRM pipeline today); `crm init` labelwatch as the first step of the relaunch bead `9ewv`. Logged as an MVP1 prerequisite under the new 9ewv capability section. Rationale: Coming-Soon mode is the real gate during build-phase; adding CRM ceremony now would cost friction without proportional safety gain — but real-money traffic REQUIRES CRM governance, so relaunch cannot begin without it.
- **2026-04-23** — p4zb code landed: `sql/005_customers.sql` applied to `shellcorp-labelwatch`; `types/database.types.ts`, `lib/customers.ts`, `appendFirmAliases()` helper in `lib/firms.ts`, `/onboard` + `/onboard/complete` pages, `/api/onboard` POST handler, `checkout.session.completed` → customer-skeleton upsert in the webhook, `success_url` flipped to `/onboard?session_id=...`. Code review fixes folded in (duplicate-channel guard via DB unique index + app-level short-circuit, payment_status guard, alias normalization). End-to-end exercise waits for relaunch (bead `infrastructure-9ewv`); atomic alias RPC queued as MVP2.
- **2026-04-23** — Added `2auk` (contact form) as shipped. Replaces the dead `hello@label.watch` mailto on the marketing page and checkout-banner portal-error path with a real `/contact` form backed by Supabase + Resend.
- **2026-04-23** — Initial roadmap. p4zb MVP1 scope locked (schema + `/onboard` + webhook skeleton). MVP2 backlog seeded from Phase-3 clarifying-questions discussion.
