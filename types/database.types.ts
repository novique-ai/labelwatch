// Hand-authored Supabase row types for the tables touched in MVP1.
// Full CLI-generated `supabase gen types` adoption is MVP2 (see
// docs/mvp-roadmap.md). Keep this in sync with sql/*.sql migrations.

import type Stripe from "stripe";

export type Tier = "starter" | "pro" | "team";

export type ChannelType = "slack" | "teams" | "http" | "email";

export const INGREDIENT_CATEGORIES = [
  "protein",
  "vitamins",
  "minerals",
  "herbals_botanicals",
  "probiotics",
  "sports_nutrition",
  "weight_management",
  "amino_acids",
  "omega_fatty_acids",
  "pre_workout",
  "childrens",
  "other",
] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export type SeverityClass = "I" | "II" | "III";

export type SeverityPreferences = {
  default_min_class: SeverityClass;
  per_channel?: Record<string, { min_class: SeverityClass }>;
};

export type ChannelConfig =
  | { webhook_url: string } // slack, teams
  | { url: string; auth_header: string | null } // http
  | { address: string }; // email

export type CustomerRow = {
  id: string;
  stripe_customer_id: string;
  email: string;
  firm_name: string;
  tier: Tier;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerProfileRow = {
  id: string;
  customer_id: string;
  firm_id: string | null;
  firm_aliases: string[];
  ingredient_categories: IngredientCategory[];
  severity_preferences: SeverityPreferences | Record<string, never>;
  created_at: string;
  updated_at: string;
};

export type CustomerChannelRow = {
  id: string;
  customer_id: string;
  type: ChannelType;
  config: ChannelConfig;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

// Re-export Stripe event helper for callers that need to narrow webhook payloads.
export type CheckoutSession = Stripe.Checkout.Session;

// -----------------------------------------------------------------------------
// Listing Copy Audit (lcaudit) — bead infrastructure-sl26.
// See sql/006_audit.sql + docs/mvp-roadmap.md.
// -----------------------------------------------------------------------------

export type AuditStatus = "pending" | "running" | "complete" | "failed";
export type AuditSeverity = "low" | "medium" | "high";
export type AuditFindingType =
  | "claim_drift"
  | "ingredient_mismatch"
  | "missing_warning";

export type SfpIngredient = {
  name: string;
  amount: string | null;
  daily_value_pct: string | null;
};

export type SfpExtract = {
  ingredients: SfpIngredient[];
  claims: string[];
  serving_size: string | null;
  warnings: string[];
};

export type ListingClaim = {
  text: string;
  line: number;
};

export type ListingIngredientMention = {
  name: string;
  amount: string | null;
  line: number;
};

export type ListingExtract = {
  ingredients: ListingIngredientMention[];
  claims: ListingClaim[];
  warnings_surfaced: string[];
};

export type AuditRunRow = {
  id: string;
  customer_id: string;
  sfp_storage_path: string;
  listing_text: string;
  listing_text_sha256: string;
  status: AuditStatus;
  error: string | null;
  finding_count: number;
  severity_max: AuditSeverity | null;
  sfp_extract: SfpExtract | null;
  listing_extract: ListingExtract | null;
  run_at: string;
  completed_at: string | null;
};

export type AuditFindingRow = {
  id: string;
  run_id: string;
  finding_type: AuditFindingType;
  severity: AuditSeverity;
  excerpt: string;
  detail: string | null;
  sfp_reference: string | null;
  listing_line: number | null;
  created_at: string;
};
