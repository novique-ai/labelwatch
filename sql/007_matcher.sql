-- LabelWatch: matcher_runs + delivery_jobs (bead infrastructure-xv3f).
-- Target: shellcorp-labelwatch Supabase project (ref ulypsprgdsasaxtjovtd).
--
-- Design references:
--   Open Brain 95e3a497-5c9e-4637-a3a0-23446a678b9d — queue-architecture ADR
--     (Postgres-table chosen over Inngest/pgmq for v1; alternatives kept for v0.2+).
--   Open Brain da1e2a70-d376-4822-b14c-d08b57d5d616 — MVP1 relaunch sequence.
--   docs/mvp-roadmap.md changelog 2026-04-30 — Phase 1 verification.
--   Upstream: app/api/cron/match/route.ts → lib/matcher.ts (this bead).
--   Downstream: vlm7 (delivery pipeline) reads delivery_jobs with
--     FOR UPDATE SKIP LOCKED.
--
-- Conventions:
--   - RLS enabled, service_role only (matches 005_customers.sql + 006_audit.sql).
--   - Status enums are CHECK constraints (not Postgres ENUM type) for
--     forward-compat — adding new states later doesn't require an enum migration.
--   - Idempotency: UNIQUE (recall_id, customer_channel_id) on delivery_jobs.
--   - 23505 race-recovery is the repo-wide convention for concurrent inserts
--     (lib/firms.ts:54-62, lib/customers.ts:87-96).
--   - Cleanup at bottom: removes the Phase-1 synthetic onboard seed
--     (customer 8899eb1e — its profile + channel rows only; the customers
--     row stays because audit_runs from sl26 smoke depend on it).

-- ---------------------------------------------------------------------------
-- 1. GIN index on customer_profiles.firm_aliases
--    customer_profiles.ingredient_categories already has a GIN index from
--    005_customers.sql. firm_aliases did not — without this, the matcher's
--    array-overlap (`&&`) query against firm_aliases would full-scan all
--    profiles on every recall.
-- ---------------------------------------------------------------------------
create index if not exists customer_profiles_firm_aliases_gin
  on public.customer_profiles using gin (firm_aliases);

-- ---------------------------------------------------------------------------
-- 2. matcher_runs — audit/observability row for each runMatcher() invocation.
--    Shape mirrors poller_runs (lib/poller.ts precedent) with two additions:
--    `last_processed_first_seen_at` (the watermark) and a wider status enum
--    that includes 'partial' for runs that processed some but errored before
--    finishing.
-- ---------------------------------------------------------------------------
create table if not exists public.matcher_runs (
  id                            uuid        primary key default gen_random_uuid(),
  started_at                    timestamptz not null default now(),
  finished_at                   timestamptz,
  status                        text        not null default 'running'
                                  check (status in ('running', 'ok', 'partial', 'error')),
  -- Counters
  scanned                       integer     not null default 0,    -- recalls considered
  matched                       integer     not null default 0,    -- recalls that produced ≥1 job
  jobs_emitted                  integer     not null default 0,    -- net-new delivery_jobs rows
  dead_letter                   integer     not null default 0,    -- recalls with 0 eligible channels
  error_message                 text,
  duration_ms                   integer,
  -- Watermark: the first_seen_at of the last successfully-processed recall
  -- in this run. Set at run completion. NULL on a run that processed nothing.
  -- The next run reads MAX(last_processed_first_seen_at) WHERE status IN ('ok','partial')
  -- as its starting cursor. On first run (no prior matcher_runs), fall back
  -- to NOW() - INTERVAL '$MATCHER_BACKFILL_DAYS days' (default 7).
  last_processed_first_seen_at  timestamptz
);

create index if not exists matcher_runs_started_at_idx
  on public.matcher_runs (started_at desc);

-- Watermark-lookup index: getWatermark() executes
--   SELECT last_processed_first_seen_at FROM matcher_runs
--   WHERE status IN ('ok','partial')
--   ORDER BY finished_at DESC LIMIT 1
create index if not exists matcher_runs_watermark_lookup_idx
  on public.matcher_runs (finished_at desc)
  where status in ('ok', 'partial');

alter table public.matcher_runs enable row level security;

-- ---------------------------------------------------------------------------
-- 3. delivery_jobs — one row per (recall × customer_channel) the matcher
--    decided should be delivered. Queue claim pattern by vlm7:
--      WHERE status = 'pending' AND next_attempt_at <= NOW()
--      ORDER BY created_at ASC
--      LIMIT 50 FOR UPDATE SKIP LOCKED
--    Severity gating is performed BY THE MATCHER before insert; vlm7 does
--    NOT re-evaluate severity_preferences. Channel `enabled=true` is
--    re-checked at delivery time by vlm7 (toggle race).
-- ---------------------------------------------------------------------------
create table if not exists public.delivery_jobs (
  id                          uuid        primary key default gen_random_uuid(),

  -- The recall this job is for. CASCADE: recall deletion (e.g., FDA dedup
  -- correction) makes pending jobs invalid — drop them.
  recall_id                   uuid        not null
                                references public.recalls(id) on delete cascade,

  -- The customer who matched. CASCADE: churned customer = pending jobs vanish;
  -- vlm7 never delivers to a dead account.
  customer_id                 uuid        not null
                                references public.customers(id) on delete cascade,

  -- The specific channel to deliver to. CASCADE: a deleted channel
  -- (e.g., Slack workspace disconnected) means pending jobs for it are
  -- undeliverable — drop them.
  customer_channel_id         uuid        not null
                                references public.customer_channels(id) on delete cascade,

  -- How the recall matched the customer:
  --   firm_alias          — recall.firm_name_raw matched customer_profiles.firm_aliases
  --   ingredient_category — recall's classified ingredient categories overlapped
  --                         customer_profiles.ingredient_categories (peer-watch)
  match_reason                text        not null
                                check (match_reason in ('firm_alias', 'ingredient_category')),
  -- The specific value that triggered the match — the alias string for
  -- firm_alias, the category name for ingredient_category. Used by vlm7
  -- to render a "YOUR FIRM" vs "Peer recall in your protein category" hint.
  matched_value               text        not null,

  -- Queue state machine: pending → delivering → sent | failed | dead_letter
  --   pending     — created by matcher, awaiting vlm7
  --   delivering  — vlm7 has claimed via FOR UPDATE SKIP LOCKED
  --   sent        — channel adapter succeeded
  --   failed      — transient failure, will retry (next_attempt_at controls)
  --   dead_letter — exceeded max_attempts; manual intervention required
  status                      text        not null default 'pending'
                                check (status in (
                                  'pending',
                                  'delivering',
                                  'sent',
                                  'failed',
                                  'dead_letter'
                                )),
  attempts                    integer     not null default 0,
  last_attempt_at             timestamptz,
  next_attempt_at             timestamptz not null default now(),
  last_error                  text,

  -- Severity_class denormalized from recalls.classification AT MATCH TIME.
  -- Stored verbatim ('Class I' / 'Class II' / 'Class III') so vlm7 renders
  -- without a join. The gate check (min_class) was already applied by the
  -- matcher; this column is the evidence + render value, not a re-evaluated gate.
  severity_class              text        not null
                                check (severity_class in ('Class I', 'Class II', 'Class III')),

  sent_at                     timestamptz,
  created_at                  timestamptz not null default now(),

  -- Audit back-reference. SET NULL: a deleted matcher_run (administrative
  -- cleanup) does not cascade-delete its jobs. The job survives without
  -- the audit trail.
  created_by_matcher_run_id   uuid
                                references public.matcher_runs(id) on delete set null
);

-- Idempotency: a (recall, channel) pair gets at most one job, regardless
-- of how many times the matcher (re)processes the recall.
-- ON CONFLICT DO NOTHING is the matcher's insert pattern.
create unique index if not exists delivery_jobs_idempotency_key
  on public.delivery_jobs (recall_id, customer_channel_id);

-- Queue claim index. Partial-WHERE on status='pending' keeps the index
-- narrow at steady state (terminal-status rows dominate but are excluded).
-- Composite (next_attempt_at, created_at) satisfies the WHERE filter and
-- the ORDER BY in one index scan, supporting the FOR UPDATE SKIP LOCKED
-- pattern vlm7 uses.
create index if not exists delivery_jobs_queue_claim_idx
  on public.delivery_jobs (next_attempt_at, created_at)
  where status = 'pending';

-- Customer history index: per-customer delivery log queries
-- (customer-portal /history page, support tickets).
create index if not exists delivery_jobs_customer_id_created_at_idx
  on public.delivery_jobs (customer_id, created_at desc);

-- Per-recall lookup: "which customers got notified about recall X?"
create index if not exists delivery_jobs_recall_id_idx
  on public.delivery_jobs (recall_id);

alter table public.delivery_jobs enable row level security;

-- ---------------------------------------------------------------------------
-- RLS policies — service_role only (consistent with 005_customers.sql and
-- 006_audit.sql conventions). No row-level user policies for MVP1.
-- ---------------------------------------------------------------------------
create policy "service_role_all_matcher_runs"
  on public.matcher_runs
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_all_delivery_jobs"
  on public.delivery_jobs
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- CLEANUP: remove the Phase-1 synthetic onboard seed.
--
-- Background (per docs/mvp-roadmap.md changelog 2026-04-30):
--   The customer 8899eb1e-986f-48de-b216-f0adc9dbbba4 (smoke-sl26@example.test,
--   cus_UP4aI9so56qXjp) was created by the sl26 (audit) smoke runs and had
--   onboarding_completed_at stamped without a real /onboard exercise.
--   Phase 1 of the MVP1-relaunch sequence (2026-04-30) seeded a synthetic
--   customer_profiles row + customer_channels (slack) row for it to verify
--   the matcher-eligibility query. The seed is identifiable by the
--   firm_aliases marker 'phase1-onboard-seed'.
--
--   Now that xv3f is shipping, that synthetic seed must be removed before
--   the matcher runs in production — otherwise the matcher would emit jobs
--   for it and vlm7 would dead-letter them (the slack webhook URL is
--   deliberately invalid: `T_PHASE1_SEED/B_PHASE1_SEED/synthetic-not-real`).
--
-- We delete only the profile + channels — NOT the customers row, which
-- still has audit_runs (5 rows / 30 audit_findings) attached from the sl26
-- smoke runs (per Phase 1 verification). Cascade from customer would
-- remove those audit records.
--
-- Idempotent: re-running the migration deletes 0 rows.
-- ---------------------------------------------------------------------------

-- Step 1: delete the synthetic channel(s) for the seeded profile's customer.
delete from public.customer_channels
  where customer_id in (
    select customer_id
    from public.customer_profiles
    where 'phase1-onboard-seed' = any(firm_aliases)
  );

-- Step 2: delete the synthetic profile itself.
delete from public.customer_profiles
  where 'phase1-onboard-seed' = any(firm_aliases);
