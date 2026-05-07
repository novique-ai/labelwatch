-- LabelWatch: Team REST API + API keys (bead infrastructure-2mkx).
-- Target: shellcorp-labelwatch (ref ulypsprgdsasaxtjovtd).
-- Staging: shellcorp-labelwatch-test (ref luuepydfyqioluizjlml).
--
-- Changes:
--   1. api_keys table — per-org long-lived tokens for programmatic access
--
-- Key format (app-layer): lw_<64-hex-chars>  (67 chars total)
-- Storage: SHA-256 hex hash of the full key; the plaintext is shown ONCE
-- at creation and never stored. Revoked keys have revoked_at IS NOT NULL.

create table if not exists public.api_keys (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null
                     references public.organizations(id) on delete cascade,
  name             text        not null,
  -- SHA-256 hex of the raw key. UNIQUE prevents accidental duplicates.
  key_hash         text        not null unique,
  created_at       timestamptz not null default now(),
  last_used_at     timestamptz,
  revoked_at       timestamptz  -- null = active; non-null = revoked
);

-- Fast lookup by hash (the hot path on every API request).
create index if not exists api_keys_key_hash_idx
  on public.api_keys (key_hash)
  where revoked_at is null;

-- List active keys for an org.
create index if not exists api_keys_organization_id_idx
  on public.api_keys (organization_id)
  where revoked_at is null;

alter table public.api_keys enable row level security;

create policy "service_role_all_api_keys"
  on public.api_keys for all to service_role
  using (true) with check (true);
