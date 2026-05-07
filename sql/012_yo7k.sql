-- LabelWatch: custom alert rules — Team keyword-based matching (bead infrastructure-yo7k).
-- Target: shellcorp-labelwatch (ref ulypsprgdsasaxtjovtd).
-- Staging: shellcorp-labelwatch-test (ref luuepydfyqioluizjlml).
--
-- Changes:
--   1. alert_rules table — per-org keyword rules that supplement the standard matcher
--   2. delivery_jobs.match_reason CHECK — add 'custom_rule' value

-- ---------------------------------------------------------------------------
-- 1. alert_rules: keyword-based supplemental match rules for Team orgs.
--    Each rule has a set of keywords matched against product_description +
--    reason_for_recall (case-insensitive). Any keyword hit emits a
--    delivery_job with match_reason='custom_rule'.
--    Scoped to org (not individual customer) — all seats benefit from org rules.
-- ---------------------------------------------------------------------------
create table if not exists public.alert_rules (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null
                     references public.organizations(id) on delete cascade,
  name             text        not null,
  keywords         text[]      not null default '{}',
  enabled          boolean     not null default true,
  created_at       timestamptz not null default now()
);

-- Partial index for the matcher query (only enabled rules are loaded).
create index if not exists alert_rules_organization_enabled_idx
  on public.alert_rules (organization_id)
  where enabled = true;

alter table public.alert_rules enable row level security;

create policy "service_role_all_alert_rules"
  on public.alert_rules for all to service_role
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2. Expand delivery_jobs.match_reason CHECK to include 'custom_rule'.
--    Mirrors the 010_xzuz.sql pattern: query pg_constraint for the real name
--    before dropping, then recreate with the expanded set.
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
                 and attname  = 'match_reason')
          ];
  if v_conname is not null then
    execute 'alter table public.delivery_jobs drop constraint ' || quote_ident(v_conname);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.delivery_jobs'::regclass
      and conname   = 'delivery_jobs_match_reason_check'
  ) then
    alter table public.delivery_jobs
      add constraint delivery_jobs_match_reason_check
        check (match_reason in ('firm_alias', 'ingredient_category', 'custom_rule'));
  end if;
end $$;
