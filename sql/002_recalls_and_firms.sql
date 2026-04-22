-- LabelWatch: firms + recalls schema (bead infrastructure-zxv3).
-- Target: shellcorp-labelwatch Supabase project (ref ulypsprgdsasaxtjovtd).
-- RLS: service_role only. App hits these with SUPABASE_SERVICE_ROLE_KEY.
--
-- FORWARD-COMPAT: today we ingest only dietary-supplement records (filtered at
-- the openFDA fetch layer). The `vertical` column lets us expand to the full
-- food/enforcement feed for market.watch without a schema change — drop the
-- ingest filter, add new vertical values, done.

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- firms: canonical producer/brand identity across recall history.
-- Primary key is the UUID; matching happens via canonical_name + aliases[].
-- Aliases capture DBAs, subsidiaries, and openFDA name variants ("Inc." vs
-- "Incorporated", trailing comma, etc.).
-- -----------------------------------------------------------------------------
create table if not exists public.firms (
  id              uuid primary key default gen_random_uuid(),
  canonical_name  text not null,  -- stored normalized (see normalize_firm_name)
  display_name    text not null,  -- original casing for UI
  aliases         text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists firms_canonical_name_key
  on public.firms (canonical_name);

create index if not exists firms_aliases_gin
  on public.firms using gin (aliases);

-- Normalize a firm name for matching: lowercase, trim, collapse whitespace,
-- strip trailing punctuation and common suffixes' punctuation variance.
-- Kept deliberately conservative — too aggressive = false merges.
create or replace function public.normalize_firm_name(raw text)
returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(
             lower(coalesce(raw, '')),
             '[[:space:]]+', ' ', 'g'
           ),
           '[[:space:],\.]+$', '', 'g'
         )
$$;

-- -----------------------------------------------------------------------------
-- recalls: one row per openFDA recall_number. Upserted on every poll.
-- recall_initiation_date is the event date (what customers care about).
-- report_date is when FDA published it (what we poll against).
-- -----------------------------------------------------------------------------
create table if not exists public.recalls (
  id                        uuid primary key default gen_random_uuid(),
  recall_number             text not null unique,
  firm_id                   uuid references public.firms(id) on delete set null,
  firm_name_raw             text not null,  -- as-reported by openFDA
  product_description       text,
  reason_for_recall         text,
  classification            text,  -- "Class I" | "Class II" | "Class III"
  status                    text,  -- "Ongoing" | "Completed" | "Terminated"
  recall_initiation_date    date,
  report_date               date,
  source                    text not null default 'openfda-food-enforcement',
  vertical                  text not null default 'dietary_supplement',
  openfda_raw               jsonb not null,
  first_seen_at             timestamptz not null default now(),
  last_updated_at           timestamptz not null default now()
);

create index if not exists recalls_firm_id_idx
  on public.recalls (firm_id, recall_initiation_date desc);

create index if not exists recalls_classification_idx
  on public.recalls (classification, recall_initiation_date desc);

create index if not exists recalls_report_date_idx
  on public.recalls (report_date desc);

create index if not exists recalls_vertical_idx
  on public.recalls (vertical, recall_initiation_date desc);

-- -----------------------------------------------------------------------------
-- poller_runs: observability for the 5-min poll cadence. Truncated on 90-day
-- rolling window so it stays tiny.
-- -----------------------------------------------------------------------------
create table if not exists public.poller_runs (
  id                uuid primary key default gen_random_uuid(),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running',  -- running | ok | error
  scanned           int not null default 0,
  inserted          int not null default 0,
  updated           int not null default 0,
  new_firms         int not null default 0,
  error_message     text,
  duration_ms       int
);

create index if not exists poller_runs_started_at_idx
  on public.poller_runs (started_at desc);

-- -----------------------------------------------------------------------------
-- RLS: service_role only (matches existing tables in 001_initial_schema.sql).
-- -----------------------------------------------------------------------------
alter table public.firms enable row level security;
alter table public.recalls enable row level security;
alter table public.poller_runs enable row level security;
