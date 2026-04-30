-- LabelWatch: vlm7 delivery pipeline scaffolding (bead infrastructure-vlm7).
-- Target: shellcorp-labelwatch Supabase project (ref ulypsprgdsasaxtjovtd).
--
-- Design references:
--   Open Brain 95e3a497-5c9e-4637-a3a0-23446a678b9d — queue-architecture ADR
--     (Postgres-table chosen over Inngest/pgmq for v1).
--   Open Brain da1e2a70-d376-4822-b14c-d08b57d5d616 — MVP1 relaunch sequence.
--   sql/007_matcher.sql — upstream that creates delivery_jobs.
--
-- What this migration adds:
--   - dlq_alerts: dedup table for "this customer_channel hit dead_letter
--     today, don't spam support@novique.ai twice".
--   - claim_pending_delivery_jobs(p_limit): atomic FOR UPDATE SKIP LOCKED
--     claim of pending rows. PostgREST .from().update() cannot express
--     FOR UPDATE SKIP LOCKED directly; calling via supabase.rpc() does.
--   - recover_stuck_delivering(): resets rows stuck in 'delivering' state
--     for >5 minutes back to 'pending'. attempts counter preserved.
--
-- Convention notes:
--   security_invoker (no SECURITY DEFINER): the TypeScript layer authenticates
--   as service_role which already has full RLS access; no privilege escalation
--   needed. Matches the existing normalize_firm_name() precedent in 002.

-- ---------------------------------------------------------------------------
-- 1. dlq_alerts dedup table
-- ---------------------------------------------------------------------------
create table if not exists public.dlq_alerts (
  customer_channel_id  uuid        not null
                         references public.customer_channels(id) on delete cascade,
  alerted_on           date        not null default current_date,
  created_at           timestamptz not null default now(),
  primary key (customer_channel_id, alerted_on)
);

alter table public.dlq_alerts enable row level security;

create policy "service_role_all_dlq_alerts"
  on public.dlq_alerts
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 2. claim_pending_delivery_jobs — atomic batch claim with SKIP LOCKED.
--    Concurrent worker invocations skip rows being processed elsewhere
--    rather than blocking. Returns at most p_limit rows (default 50) in
--    next_attempt_at, created_at ASC order.
-- ---------------------------------------------------------------------------
create or replace function public.claim_pending_delivery_jobs(p_limit int default 50)
returns setof public.delivery_jobs
language sql
security invoker
as $$
  update public.delivery_jobs
  set
    status          = 'delivering',
    last_attempt_at = now(),
    attempts        = attempts + 1
  where id in (
    select id
    from public.delivery_jobs
    where status = 'pending'
      and next_attempt_at <= now()
    order by next_attempt_at asc, created_at asc
    limit p_limit
    for update skip locked
  )
  returning *;
$$;

grant execute on function public.claim_pending_delivery_jobs(int) to service_role;

-- ---------------------------------------------------------------------------
-- 3. recover_stuck_delivering — resets rows stuck in 'delivering' state.
--    Happens when a worker crashes mid-send. Preserves attempts counter so
--    a flaky network doesn't reset the dead-letter clock. Returns count.
-- ---------------------------------------------------------------------------
create or replace function public.recover_stuck_delivering()
returns int
language sql
security invoker
as $$
  with updated as (
    update public.delivery_jobs
    set status = 'pending'
    where status = 'delivering'
      and last_attempt_at < now() - interval '5 minutes'
    returning id
  )
  select count(*)::int from updated;
$$;

grant execute on function public.recover_stuck_delivering() to service_role;
