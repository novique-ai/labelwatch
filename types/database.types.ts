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

// HTTP webhook channel. signing_secret is server-generated (32 bytes hex,
// 64 chars) at /onboard for first-time onboards (bead infrastructure-vlm7).
// Used to compute X-LabelWatch-Signature: sha256=<hex(HMAC-SHA256(body))>.
// Returned to the customer ONCE on /onboard response — they must store it
// to verify incoming webhooks. There is no API to retrieve a forgotten
// secret in v1; the customer would need to /onboard again.
//
// Type-wise signing_secret is OPTIONAL because client-side onboarding form
// code constructs the config without it; the /api/onboard route's
// validateChannel ALWAYS generates one before persistence. At rest in the
// DB, every HTTP channel row has signing_secret. The httpAdapter (vlm7)
// fails-loud non-transient if the field is absent at delivery time.
export type HttpChannelConfig = {
  url: string;
  auth_header: string | null;
  signing_secret?: string;
};

export type ChannelConfig =
  | { webhook_url: string } // slack, teams
  | HttpChannelConfig // http
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

// -----------------------------------------------------------------------------
// Recall + Firm rows — produced by the openFDA poller (bead infrastructure-zxv3),
// consumed by the matcher (bead infrastructure-xv3f).
// See sql/002_recalls_and_firms.sql.
// -----------------------------------------------------------------------------

export type RecallClassification = "Class I" | "Class II" | "Class III";

export type RecallRow = {
  id: string;
  recall_number: string;
  firm_id: string | null;
  firm_name_raw: string;
  product_description: string | null;
  reason_for_recall: string | null;
  classification: RecallClassification | null;
  status: string | null;
  recall_initiation_date: string | null;
  report_date: string | null;
  source: string;
  vertical: string;
  openfda_raw: Record<string, unknown>;
  first_seen_at: string;
  last_updated_at: string;
};

export type FirmRow = {
  id: string;
  canonical_name: string;
  display_name: string;
  aliases: string[];
  created_at: string;
  updated_at: string;
};

// -----------------------------------------------------------------------------
// Matcher + delivery — bead infrastructure-xv3f.
// See sql/007_matcher.sql.
// Open Brain ADR (queue alternatives): 95e3a497-5c9e-4637-a3a0-23446a678b9d.
// -----------------------------------------------------------------------------

export type MatcherRunStatus = "running" | "ok" | "partial" | "error";

export type MatchReason = "firm_alias" | "ingredient_category";

export type DeliveryJobStatus =
  | "pending"
  | "delivering"
  | "sent"
  | "failed"
  | "dead_letter";

export type MatcherRunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: MatcherRunStatus;
  scanned: number;
  matched: number;
  jobs_emitted: number;
  dead_letter: number;
  error_message: string | null;
  duration_ms: number | null;
  last_processed_first_seen_at: string | null;
};

export type DeliveryJobRow = {
  id: string;
  recall_id: string;
  customer_id: string;
  customer_channel_id: string;
  match_reason: MatchReason;
  matched_value: string;
  status: DeliveryJobStatus;
  attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string;
  last_error: string | null;
  severity_class: RecallClassification;
  sent_at: string | null;
  created_at: string;
  created_by_matcher_run_id: string | null;
};

// -----------------------------------------------------------------------------
// Delivery worker — bead infrastructure-vlm7. See sql/008_vlm7.sql.
// -----------------------------------------------------------------------------

// Adapter return shape. transient=true means schedule retry (per backoff
// schedule), transient=false means immediate dead_letter (e.g., 401/403 —
// retrying won't help).
export type DeliveryOutcome =
  | { ok: true }
  | { ok: false; error: string; transient: boolean };

// dlq_alerts dedup table: one row per (customer_channel_id, day) prevents
// support@novique.ai from getting spammed when the same channel fails
// repeatedly within a single day.
export type DlqAlertRow = {
  customer_channel_id: string;
  alerted_on: string; // YYYY-MM-DD
  created_at: string;
};
