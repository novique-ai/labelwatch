// Pure rendering helpers for the 4 delivery adapters — bead infrastructure-vlm7.
// No I/O. Tests live in render.test.ts. All adapters import from here.

import type {
  DeliveryJobRow,
  RecallClassification,
  RecallRow,
} from "@/types/database.types";

// Severity → color map. Locked.
//   Class I   → red    (immediate health hazard)
//   Class II  → orange (temporary or medically-reversible)
//   Class III → yellow (label issue, no health hazard)
export const SEVERITY_COLORS: Record<RecallClassification, string> = {
  "Class I": "#c63a1f",
  "Class II": "#ec8800",
  "Class III": "#d4a017",
};

export function severityColor(classification: RecallClassification | null): string {
  if (!classification) return "#888888";
  return SEVERITY_COLORS[classification] ?? "#888888";
}

// Header copy is driven by match_reason:
//   firm_alias          → "🚨 <ALIAS> RECALLED" (your firm)
//   ingredient_category → "ℹ️ Peer recall in your <category> category"
export function headerText(job: DeliveryJobRow): string {
  if (job.match_reason === "firm_alias") {
    return `🚨 ${job.matched_value.toUpperCase()} RECALLED`;
  }
  return `ℹ️ Peer recall in your ${job.matched_value} category`;
}

// Body field bundle, NULL-safe. All adapters render the same fields.
export type BodyFields = {
  classification: string;
  firm_name_raw: string;
  product_description: string;
  reason_for_recall: string;
  recall_initiation_date: string;
  recall_number: string;
  fda_url: string;
};

export function buildBodyFields(recall: RecallRow): BodyFields {
  return {
    classification: recall.classification ?? "Unknown",
    firm_name_raw: recall.firm_name_raw,
    product_description: recall.product_description ?? "N/A",
    reason_for_recall: recall.reason_for_recall ?? "N/A",
    recall_initiation_date: recall.recall_initiation_date ?? "N/A",
    recall_number: recall.recall_number,
    // Link to openFDA's enforcement-record API URL filtered to this recall.
    // Until we ship a labelwatch detail page, this is the canonical source.
    fda_url: `https://api.fda.gov/food/enforcement.json?search=recall_number:%22${encodeURIComponent(recall.recall_number)}%22`,
  };
}

// Backoff schedule. attempts = the value AFTER incrementing on this
// attempt (1 = first retry, 2 = second, ...). attempts >= 5 should never
// reach this function — settleJob() dead-letters before the call.
//
// Sequence: 1m → 5m → 15m → 1h. Max time-to-DLQ ≈ 1h21m.
const BACKOFF_MS = [
  1 * 60_000,    // attempt 1 → +1m
  5 * 60_000,    // attempt 2 → +5m
  15 * 60_000,   // attempt 3 → +15m
  60 * 60_000,   // attempt 4 → +1h
] as const;

export function nextAttemptAt(attempts: number): Date {
  // Defensive clamp: out-of-range inputs use the longest backoff. The
  // caller should have already dead-lettered for attempts >= 5.
  const idx = Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1);
  return new Date(Date.now() + BACKOFF_MS[idx]);
}

// Number of attempts after which a job is dead-lettered.
export const MAX_ATTEMPTS = 5;
