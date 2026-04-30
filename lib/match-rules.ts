// Pure-function matching rules — bead infrastructure-xv3f.
// No I/O. Tests live in match-rules.test.ts.
//
// Domain:
//   classifyRecallIngredients — recall free text → IngredientCategory[]
//   matchFirmAliases          — normalized firm name → matched alias or null
//   isRecallEligibleForChannel — recall class + channel + prefs → boolean gate
//   matchCandidates           — top-level: one recall × all profiles → MatchCandidate[]
//
// Severity-class rank: Class I = 3 (highest), Class II = 2, Class III = 1.
// "min_class" semantics: a recall passes the gate if its rank >= min_class rank.

import {
  INGREDIENT_CATEGORIES,
  type CustomerChannelRow,
  type CustomerProfileRow,
  type IngredientCategory,
  type MatchReason,
  type RecallClassification,
  type RecallRow,
  type SeverityClass,
  type SeverityPreferences,
} from "@/types/database.types";

// Ingredient-category keyword catalogue. Tunable. Keep keywords lowercase;
// classifyRecallIngredients lowercases the recall text before scanning.
// The 12 categories are the closed enum on customer_profiles.ingredient_categories
// (see sql/005_customers.sql).
export const INGREDIENT_CATEGORY_KEYWORDS: Record<IngredientCategory, string[]> = {
  protein: ["protein", "whey", "casein", "collagen", "isolate", "concentrate", "bcaa"],
  vitamins: ["vitamin", "multivitamin", "ascorbic", "tocopherol", "retinol", "biotin", "folate", "folic acid", "niacin", "riboflavin", "thiamin"],
  minerals: ["mineral", "calcium", "magnesium", "zinc", "iron", "selenium", "potassium", "chromium", "iodine"],
  herbals_botanicals: ["herbal", "botanical", "ginseng", "ashwagandha", "turmeric", "curcumin", "ginkgo", "echinacea", "elderberry", "valerian", "milk thistle", "saw palmetto", "kava"],
  probiotics: ["probiotic", "lactobacillus", "bifidobacterium", "saccharomyces", "cfu"],
  sports_nutrition: ["sports nutrition", "creatine", "glutamine", "beta-alanine", "nitric oxide", "muscle"],
  weight_management: ["weight loss", "weight management", "fat burner", "thermogenic", "appetite", "garcinia", "green tea extract"],
  amino_acids: ["amino acid", "leucine", "isoleucine", "valine", "arginine", "lysine", "tryptophan", "methionine", "tyrosine", "phenylalanine"],
  omega_fatty_acids: ["omega", "fish oil", "krill oil", "epa", "dha", "flaxseed", "linseed oil"],
  pre_workout: ["pre-workout", "pre workout", "preworkout", "caffeine anhydrous", "energy blend"],
  childrens: ["children", "kids", "infant", "toddler", "pediatric", "gummy", "gummies"],
  // 'other' is intentionally never auto-classified — it's a catch-all the
  // operator can apply manually if needed.
  other: [],
};

// Class I (most severe) ranks highest so "min_class: II" allows I and II.
export const SEVERITY_CLASS_RANK: Record<SeverityClass, number> = {
  I: 3,
  II: 2,
  III: 1,
};

// Convert recall format ("Class I/II/III") → profile format ("I/II/III").
// Returns null if the input is not a known classification.
export function recallClassToSeverity(
  classification: RecallClassification | string | null | undefined,
): SeverityClass | null {
  if (classification === "Class I") return "I";
  if (classification === "Class II") return "II";
  if (classification === "Class III") return "III";
  return null;
}

// Classify a recall into zero or more ingredient categories by keyword scan.
// Pure: no I/O, deterministic, in-memory. The matcher caches the result per
// recall (one classification × N customer-channel matches).
export function classifyRecallIngredients(
  recall: Pick<RecallRow, "product_description" | "reason_for_recall">,
): IngredientCategory[] {
  const haystack = [
    recall.product_description ?? "",
    recall.reason_for_recall ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (!haystack.trim()) return [];

  const matched: IngredientCategory[] = [];
  for (const category of INGREDIENT_CATEGORIES) {
    const keywords = INGREDIENT_CATEGORY_KEYWORDS[category];
    if (keywords.length === 0) continue;
    if (keywords.some((kw) => haystack.includes(kw))) {
      matched.push(category);
    }
  }
  return matched;
}

// Return the alias string that matched, or null if none.
// Both inputs MUST already be normalized (matched at onboard time via
// normalizeFirmName from lib/firms.ts). Comparison is exact equality.
export function matchFirmAliases(
  normalizedFirmName: string,
  firmAliases: string[],
): string | null {
  if (!normalizedFirmName) return null;
  for (const alias of firmAliases) {
    if (alias === normalizedFirmName) return alias;
  }
  return null;
}

// Severity gate. Returns true if the recall should reach this channel.
//
// Resolution order:
//   1. severity_preferences.per_channel[<channelType>].min_class
//   2. severity_preferences.default_min_class
//   3. No filter (treat empty {} as send-all)
//
// A recall with classification = null (rare; older recall rows may lack it)
// fails the gate — we don't want to deliver an unclassified row.
export function isRecallEligibleForChannel(args: {
  recallClass: RecallClassification | null;
  channelType: CustomerChannelRow["type"];
  severityPrefs: SeverityPreferences | Record<string, never>;
}): boolean {
  const sev = recallClassToSeverity(args.recallClass);
  if (!sev) return false;

  // Empty {} = send-all (no preferences set yet).
  const hasDefault = "default_min_class" in args.severityPrefs;
  const perChannel = (args.severityPrefs as SeverityPreferences).per_channel;
  if (!hasDefault && !perChannel) return true;

  const minClass =
    perChannel?.[args.channelType]?.min_class ??
    (args.severityPrefs as SeverityPreferences).default_min_class;
  if (!minClass) return true; // partial config (per_channel set for other channels) → send-all for this channel

  return SEVERITY_CLASS_RANK[sev] >= SEVERITY_CLASS_RANK[minClass];
}

// Top-level pure matcher output tuple. The matcher accumulates these across
// recalls × customers × channels and bulk-inserts them as delivery_jobs rows.
export type MatchCandidate = {
  recallId: string;
  customerId: string;
  customerChannelId: string;
  matchReason: MatchReason;
  matchedValue: string;
  severityClass: RecallClassification;
};

// Per-customer input bundle for matchCandidates.
export type CustomerMatchContext = {
  profile: CustomerProfileRow;
  channels: CustomerChannelRow[]; // already filtered to enabled=true upstream
};

// Match one recall against all customer contexts. Pure.
//
// Match precedence:
//   - firm_alias hit takes priority over ingredient_category for the same
//     (customer, channel) pair — the alias hit is "your firm" which is the
//     most specific signal.
//   - ingredient_category overlap emits one candidate per matched category;
//     the matched_value carries the category name.
//   - both can co-emit if the customer has BOTH alias hits AND category
//     hits, but for distinct channels (firm-alias on Slack, category on
//     email, say). The downstream UNIQUE (recall_id, customer_channel_id)
//     deduplicates within (recall, channel) so only one job ships even if
//     this function emits two candidates.
export function matchCandidates(args: {
  recall: Pick<
    RecallRow,
    "id" | "classification" | "product_description" | "reason_for_recall"
  >;
  normalizedFirmName: string;
  recallCategories: IngredientCategory[];
  customers: CustomerMatchContext[];
}): MatchCandidate[] {
  const { recall, normalizedFirmName, recallCategories, customers } = args;
  const out: MatchCandidate[] = [];

  if (!recall.classification) return out;

  for (const { profile, channels } of customers) {
    if (channels.length === 0) continue;

    const aliasHit = matchFirmAliases(normalizedFirmName, profile.firm_aliases);
    const categoryHits = recallCategories.filter((c) =>
      profile.ingredient_categories.includes(c),
    );

    if (!aliasHit && categoryHits.length === 0) continue;

    for (const channel of channels) {
      const eligible = isRecallEligibleForChannel({
        recallClass: recall.classification,
        channelType: channel.type,
        severityPrefs: profile.severity_preferences,
      });
      if (!eligible) continue;

      if (aliasHit) {
        out.push({
          recallId: recall.id,
          customerId: profile.customer_id,
          customerChannelId: channel.id,
          matchReason: "firm_alias",
          matchedValue: aliasHit,
          severityClass: recall.classification,
        });
      } else {
        // ingredient_category — emit one candidate per matched category.
        // The DB UNIQUE on (recall_id, customer_channel_id) collapses
        // duplicates per channel; the FIRST insert wins, others are no-ops.
        // We pick the first matched category as the canonical matched_value.
        out.push({
          recallId: recall.id,
          customerId: profile.customer_id,
          customerChannelId: channel.id,
          matchReason: "ingredient_category",
          matchedValue: categoryHits[0],
          severityClass: recall.classification,
        });
      }
    }
  }

  return out;
}
