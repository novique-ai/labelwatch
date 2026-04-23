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
