-- LabelWatch: customers + profiles + delivery channels (bead infrastructure-p4zb).
-- Target: shellcorp-labelwatch Supabase project (ref ulypsprgdsasaxtjovtd).
-- RLS: service_role only. App hits these with SUPABASE_SERVICE_ROLE_KEY.
--
-- Upstream:
--   app/api/stripe/webhook/route.ts  → upserts `customers` skeleton on
--                                      checkout.session.completed
--   app/api/onboard/route.ts         → upserts `customer_profiles`, inserts
--                                      `customer_channels`, stamps
--                                      `customers.onboarding_completed_at`
--
-- Delivery gate: matcher + delivery pipeline MUST filter
--   WHERE customers.onboarding_completed_at IS NOT NULL
--     AND EXISTS (select 1 from customer_channels
--                  where customer_id = customers.id and enabled = true)

-- -----------------------------------------------------------------------------
-- customers: one row per paying Stripe customer. Natural key = stripe_customer_id.
-- Created as a skeleton by the Stripe webhook; promoted to "onboarded" by the
-- /onboard flow stamping onboarding_completed_at.
-- -----------------------------------------------------------------------------
create table if not exists public.customers (
  id                          uuid primary key default gen_random_uuid(),
  stripe_customer_id          text not null unique,
  email                       text not null,
  firm_name                   text not null,  -- as entered on Stripe Checkout
  tier                        text not null
                                check (tier in ('starter', 'pro', 'team')),
  onboarding_completed_at     timestamptz,    -- null = skeleton, not yet onboarded
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists customers_onboarding_idx
  on public.customers (onboarding_completed_at)
  where onboarding_completed_at is not null;

create index if not exists customers_email_idx
  on public.customers (lower(email));

-- -----------------------------------------------------------------------------
-- customer_profiles: 1:1 with customer in MVP1 (see docs/mvp-roadmap.md).
-- Firm identity resolved via lib/firms.ts findOrCreateFirm() on the canonical
-- name; customer-submitted DBAs/aliases are stored here (provenance) AND
-- appended to firms.aliases (matcher benefit).
-- -----------------------------------------------------------------------------
create table if not exists public.customer_profiles (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null unique
                           references public.customers(id) on delete cascade,
  firm_id                uuid references public.firms(id) on delete set null,
  firm_aliases           text[] not null default '{}',
  ingredient_categories  text[] not null default '{}',
  severity_preferences   jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Closed enum for ingredient_categories. Every element of the array must be
  -- one of the allowed values. Extensible by later migration.
  constraint customer_profiles_ingredient_categories_check
    check (
      ingredient_categories <@ array[
        'protein',
        'vitamins',
        'minerals',
        'herbals_botanicals',
        'probiotics',
        'sports_nutrition',
        'weight_management',
        'amino_acids',
        'omega_fatty_acids',
        'pre_workout',
        'childrens',
        'other'
      ]::text[]
    )
);

create index if not exists customer_profiles_firm_id_idx
  on public.customer_profiles (firm_id);

create index if not exists customer_profiles_ingredient_categories_gin
  on public.customer_profiles using gin (ingredient_categories);

-- -----------------------------------------------------------------------------
-- customer_channels: where alerts get delivered. One row per channel; customers
-- can have multiple types (slack + email + http, etc.). config is type-specific
-- jsonb validated at the delivery-adapter layer (bead infrastructure-vlm7).
--
-- MVP1 config shapes:
--   slack: { "webhook_url": "https://hooks.slack.com/..." }
--   teams: { "webhook_url": "https://outlook.office.com/..." }
--   http:  { "url": "https://...", "auth_header": "Bearer ..." | null }
--   email: { "address": "alerts@firm.com" }
-- -----------------------------------------------------------------------------
create table if not exists public.customer_channels (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id) on delete cascade,
  type           text not null
                   check (type in ('slack', 'teams', 'http', 'email')),
  config         jsonb not null,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists customer_channels_customer_id_idx
  on public.customer_channels (customer_id);

create index if not exists customer_channels_enabled_idx
  on public.customer_channels (customer_id)
  where enabled = true;

-- One channel of each type per customer for MVP1 (multi-channel is MVP2).
-- Enforces onboarding idempotency: re-submits hit 23505 in finalizeOnboarding.
create unique index if not exists customer_channels_customer_type_key
  on public.customer_channels (customer_id, type);

-- -----------------------------------------------------------------------------
-- RLS: service_role only (matches repo convention).
-- -----------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.customer_channels enable row level security;
