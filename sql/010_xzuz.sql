-- LabelWatch: cadence split — Starter daily digest, Pro+ realtime (bead infrastructure-xzuz).
-- Target: the production Supabase project.
-- Staging: the staging Supabase project.
--
-- Changes:
--   1. Add digest_window_date date NULL to delivery_jobs
--   2. Expand status CHECK to include 'digest_pending'
--   3. Partial index for efficient digest cron claim
--   4. claim_digest_delivery_jobs() stored function (atomic claim)
--
-- Staging-first: apply to staging BEFORE promoting to main.
-- Apply to prod BEFORE the main push per staging-first doctrine.
--
-- Note on CHECK constraint name: the inline CHECK in 007_matcher.sql has no explicit
-- name — Postgres auto-generates "delivery_jobs_status_check". This migration drops
-- that constraint by its generated name and recreates it with the new value.
-- The pattern is explicitly forward-compatible per the 007 comment:
--   "Status enums are CHECK constraints (not Postgres ENUM type) for
--    forward-compat — adding new states later doesn't require an enum migration."

-- ---------------------------------------------------------------------------
-- 1. New column: records the UTC calendar date a match was queued for digest.
--    NULL for realtime rows (pending/delivering/sent/dead_letter/failed).
--    Set at match time by the matcher for tier=starter customers.
--    Idempotent: IF NOT EXISTS.
-- ---------------------------------------------------------------------------
alter table public.delivery_jobs
  add column if not exists digest_window_date date null;

-- ---------------------------------------------------------------------------
-- 2. Expand the status CHECK constraint to include 'digest_pending'.
--    Drop the existing unnamed constraint (auto-named by Postgres as
--    '<table>_<column>_check') and recreate it with the expanded set.
--
--    Risk: if DROP relies on a hardcoded name and the name differs, the DROP
--    is a silent no-op (IF EXISTS), leaving the old constraint active
--    alongside the new one — which would then block all 'digest_pending'
--    inserts. To avoid this, the DO block queries pg_constraint for the real
--    name before dropping it. The new named constraint is then idempotent on
--    re-run (ADD CONSTRAINT ... IF NOT EXISTS).
-- ---------------------------------------------------------------------------
do $$
declare
  v_conname text;
begin
  select conname into v_conname
    from pg_constraint
    where conrelid = 'public.delivery_jobs'::regclass
      and contype  = 'c'
      and conkey   = array[
            (select attnum from pg_attribute
               where attrelid = 'public.delivery_jobs'::regclass
                 and attname  = 'status')
          ];
  if v_conname is not null then
    execute 'alter table public.delivery_jobs drop constraint ' || quote_ident(v_conname);
  end if;
end $$;

alter table public.delivery_jobs
  add constraint delivery_jobs_status_check
    check (status in (
      'pending',
      'delivering',
      'sent',
      'failed',
      'dead_letter',
      'digest_pending'
    ));

-- ---------------------------------------------------------------------------
-- 3. Partial index for the digest claim query.
--    claim_digest_delivery_jobs() scans WHERE status='digest_pending' AND
--    next_attempt_at <= now(). The partial WHERE keeps the index narrow at
--    steady state (terminal-status rows dominate but are excluded).
-- ---------------------------------------------------------------------------
create index if not exists delivery_jobs_digest_pending_idx
  on public.delivery_jobs (next_attempt_at, customer_id, customer_channel_id)
  where status = 'digest_pending';

-- ---------------------------------------------------------------------------
-- 4. Atomic claim function for the digest cron.
--    Claims ALL digest_pending rows whose next_attempt_at is in the past,
--    atomically setting status='delivering' and incrementing attempts.
--    Unlike claim_pending_delivery_jobs() this has no LIMIT — daily digest
--    volumes are tiny (a few recalls × a few Starter customers).
--    No FOR UPDATE SKIP LOCKED needed: Vercel cron fires once/day and
--    maxDuration=60 ensures completion before any potential second invocation.
-- ---------------------------------------------------------------------------
create or replace function public.claim_digest_delivery_jobs()
  returns setof public.delivery_jobs
  language sql
  security definer
as $$
  update public.delivery_jobs
  set
    status          = 'delivering',
    last_attempt_at = now(),
    attempts        = attempts + 1
  where
    status          = 'digest_pending'
    and next_attempt_at <= now()
  returning *;
$$;
