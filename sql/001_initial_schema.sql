-- LabelWatch initial schema
-- Target project: shellcorp-labelwatch (dedicated per-product Supabase project).
-- Because the project itself is the namespace, tables are NOT prefixed.
-- Apply via Supabase SQL editor or psql. RLS: service_role only (app uses SERVICE_ROLE_KEY).

create extension if not exists "pgcrypto";

-- Waitlist / marketing-page signups.
-- Upstream: app/api/signup/route.ts POST handler.
create table if not exists public.signups (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  tier_interest  text not null default 'starter'
                   check (tier_interest in ('starter', 'pro', 'team')),
  referrer       text,
  utm_source     text,
  utm_campaign   text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

create unique index if not exists signups_email_key
  on public.signups (lower(email));

-- Stripe webhook event log / dedup surface.
-- Upstream: lib/subscriptions.ts persistSubscriptionEvent().
create table if not exists public.subscription_events (
  id                       uuid primary key default gen_random_uuid(),
  stripe_event_id          text not null unique,
  event_type               text not null,
  tier                     text check (tier in ('starter', 'pro', 'team')),
  stripe_customer_id       text,
  stripe_subscription_id   text,
  status                   text,
  raw                      jsonb not null,
  created_at               timestamptz not null default now()
);

create index if not exists subscription_events_customer_idx
  on public.subscription_events (stripe_customer_id);
create index if not exists subscription_events_subscription_idx
  on public.subscription_events (stripe_subscription_id);
create index if not exists subscription_events_type_idx
  on public.subscription_events (event_type);

-- Lock both tables to service_role only.
alter table public.signups enable row level security;
alter table public.subscription_events enable row level security;
