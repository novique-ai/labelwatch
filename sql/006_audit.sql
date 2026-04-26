-- LabelWatch: Listing Copy Audit (lcaudit) — bead infrastructure-sl26.
-- Per docs/mvp-roadmap.md "Capability: Listing Copy Audit (lcaudit)".
--
-- audit_runs:     one row per submitted audit (SFP image + listing copy).
-- audit_findings: one row per flagged drift between SFP and listing.
--
-- Tier quota (enforced by app, not DB): starter = 1/mo, pro = 10/mo, team = ∞.
-- RLS: service_role only.

create table if not exists public.audit_runs (
  id                       uuid primary key default gen_random_uuid(),
  customer_id              uuid not null
                             references public.customers(id) on delete cascade,
  sfp_storage_path         text not null,             -- audit-sfp-images bucket path
  listing_text             text not null,             -- raw paste from customer
  listing_text_sha256      text not null,             -- de-dup detection only
  status                   text not null default 'pending'
                             check (status in ('pending','running','complete','failed')),
  error                    text,
  finding_count            integer not null default 0,
  severity_max             text
                             check (severity_max in ('low','medium','high')),
  sfp_extract              jsonb,                     -- normalized SFP structure
  listing_extract          jsonb,                     -- normalized listing structure
  run_at                   timestamptz not null default now(),
  completed_at             timestamptz
);

create index if not exists audit_runs_customer_run_at_idx
  on public.audit_runs (customer_id, run_at desc);

-- Tier-quota query support (count runs in last 30d for one customer).
create index if not exists audit_runs_customer_window_idx
  on public.audit_runs (customer_id, run_at)
  where status in ('running','complete');

create table if not exists public.audit_findings (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null
                    references public.audit_runs(id) on delete cascade,
  finding_type    text not null
                    check (finding_type in (
                      'claim_drift',
                      'ingredient_mismatch',
                      'missing_warning'
                    )),
  severity        text not null check (severity in ('low','medium','high')),
  excerpt         text not null,
  detail          text,
  sfp_reference   text,                                -- e.g. ingredient name or warning text
  listing_line    integer,                             -- line number in listing copy
  created_at      timestamptz not null default now()
);

create index if not exists audit_findings_run_id_idx
  on public.audit_findings (run_id);

alter table public.audit_runs enable row level security;
alter table public.audit_findings enable row level security;
