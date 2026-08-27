-- LabelWatch: multi-user org seats — Team up to 5 seats (bead infrastructure-cin7).
-- Target: the production Supabase project.
-- Staging: the staging Supabase project.
--
-- Changes:
--   1. organizations table
--   2. memberships table
--   3. invitations table
--   4. customers.organization_id  nullable FK (member-only, owner stays NULL)
--   5. customers.stripe_customer_id  drop NOT NULL  (members have no Stripe sub)
--
-- Backward compat:
--   All existing customers have organization_id = NULL (solo or owner).
--   stripe_customer_id is still UNIQUE — NULL values are treated as distinct
--   by Postgres so multiple member rows are safe.

-- ---------------------------------------------------------------------------
-- 1. organizations — one per Team billing account.
--    Created in finalizeOnboarding when tier = 'team'.
--    Cascade delete: if the owner's customers row is removed, the org and all
--    its memberships + invitations are removed too.
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id                  uuid        primary key default gen_random_uuid(),
  name                text        not null,
  owner_customer_id   uuid        not null unique
                        references public.customers(id) on delete cascade,
  created_at          timestamptz not null default now()
);

alter table public.organizations enable row level security;

create policy "service_role_all_organizations"
  on public.organizations for all to service_role
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 2. memberships — who belongs to an org (incl. the owner as role='owner').
--    UNIQUE (organization_id, customer_id) prevents double-membership.
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null
                     references public.organizations(id) on delete cascade,
  customer_id      uuid        not null
                     references public.customers(id) on delete cascade,
  role             text        not null default 'member'
                     check (role in ('owner', 'admin', 'member')),
  invited_by       uuid        references public.customers(id) on delete set null,
  accepted_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (organization_id, customer_id)
);

create index if not exists memberships_organization_id_idx
  on public.memberships (organization_id);

create index if not exists memberships_customer_id_idx
  on public.memberships (customer_id);

alter table public.memberships enable row level security;

create policy "service_role_all_memberships"
  on public.memberships for all to service_role
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3. invitations — pending email invites (one per org+email, expires in 7d).
--    token is HMAC-signed (lib/invite-token.ts) and stored for validation
--    and idempotent re-use.
--    accepted_at = null means pending; non-null means consumed.
-- ---------------------------------------------------------------------------
create table if not exists public.invitations (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null
                     references public.organizations(id) on delete cascade,
  email            text        not null,
  role             text        not null default 'member'
                     check (role in ('owner', 'admin', 'member')),
  token            text        not null unique,
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists invitations_organization_id_idx
  on public.invitations (organization_id);

-- For token validation lookups
create index if not exists invitations_token_idx
  on public.invitations (token);

alter table public.invitations enable row level security;

create policy "service_role_all_invitations"
  on public.invitations for all to service_role
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 4. customers.organization_id — set only on member (non-owner) rows.
--    Owner's org is found via organizations.owner_customer_id.
--    ON DELETE SET NULL: if the org is removed, members become solo accounts.
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

create index if not exists customers_organization_id_idx
  on public.customers (organization_id)
  where organization_id is not null;

-- ---------------------------------------------------------------------------
-- 5. customers.stripe_customer_id — drop NOT NULL.
--    Members are provisioned without a Stripe subscription; their row has
--    stripe_customer_id = NULL. The UNIQUE constraint remains (Postgres treats
--    each NULL as distinct, so multiple member rows are safe).
-- ---------------------------------------------------------------------------
alter table public.customers
  alter column stripe_customer_id drop not null;
