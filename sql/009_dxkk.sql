-- LabelWatch: dxkk per-channel severity routing (bead infrastructure-dxkk).
-- Target: shellcorp-labelwatch (prod) AND shellcorp-labelwatch-test (staging).
--
-- What this migration adds:
--   - customer_channels.severity_filter jsonb (nullable). When non-null,
--     overrides customer_profiles.severity_preferences.default_min_class
--     for THIS channel only. Shape: { "min_class": "I"|"II"|"III" }.
--     Null = inherit the customer-level default (backward compatible).
--
-- Tier semantics (enforced in TypeScript at /api/account/channels):
--   - Starter: severity_filter is null on every channel; UI is read-only.
--   - Pro / Team: severity_filter may be set per channel.
--
-- The matcher (lib/match-rules.ts isRecallEligibleForChannel) reads
-- severity_filter first and falls back to the profile default.

alter table public.customer_channels
  add column if not exists severity_filter jsonb;

-- Document the column at the catalog level so future psql users see the
-- intent without needing to read this file.
comment on column public.customer_channels.severity_filter is
  'Optional per-channel severity gate (Pro+ tier feature, bead dxkk). '
  'Shape: {"min_class":"I"|"II"|"III"}. NULL means inherit '
  'customer_profiles.severity_preferences.default_min_class.';
