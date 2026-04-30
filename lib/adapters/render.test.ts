// Tests for lib/adapters/render.ts — bead infrastructure-vlm7.
// Pure-function unit tests. Mirrors lib/match-rules.test.ts convention.

import { describe, expect, it } from "vitest";
import {
  buildBodyFields,
  headerText,
  MAX_ATTEMPTS,
  nextAttemptAt,
  SEVERITY_COLORS,
  severityColor,
} from "./render";
import type { DeliveryJobRow, RecallRow } from "@/types/database.types";

function job(overrides: Partial<DeliveryJobRow> = {}): DeliveryJobRow {
  return {
    id: "job-1",
    recall_id: "rec-1",
    customer_id: "cust-1",
    customer_channel_id: "ch-1",
    match_reason: "firm_alias",
    matched_value: "acme",
    status: "delivering",
    attempts: 1,
    last_attempt_at: null,
    next_attempt_at: "2026-01-01T00:00:00Z",
    last_error: null,
    severity_class: "Class II",
    sent_at: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by_matcher_run_id: null,
    ...overrides,
  };
}

function recall(overrides: Partial<RecallRow> = {}): RecallRow {
  return {
    id: "rec-1",
    recall_number: "F-1234-2026",
    firm_id: null,
    firm_name_raw: "Ambrosia Brands LLC",
    product_description: "Whey protein powder, vanilla",
    reason_for_recall: "Undeclared milk allergen",
    classification: "Class II",
    status: "Ongoing",
    recall_initiation_date: "2026-02-13",
    report_date: "2026-02-13",
    source: "openfda-food-enforcement",
    vertical: "dietary_supplement",
    openfda_raw: {},
    first_seen_at: "2026-02-14T00:00:00Z",
    last_updated_at: "2026-02-14T00:00:00Z",
    ...overrides,
  };
}

describe("severityColor", () => {
  it("Class I → #c63a1f (red)", () => {
    expect(severityColor("Class I")).toBe("#c63a1f");
  });
  it("Class II → #ec8800 (orange)", () => {
    expect(severityColor("Class II")).toBe("#ec8800");
  });
  it("Class III → #d4a017 (yellow)", () => {
    expect(severityColor("Class III")).toBe("#d4a017");
  });
  it("null → fallback gray", () => {
    expect(severityColor(null)).toBe("#888888");
  });
});

describe("SEVERITY_COLORS map", () => {
  it("has exactly the three classes", () => {
    expect(Object.keys(SEVERITY_COLORS).sort()).toEqual([
      "Class I",
      "Class II",
      "Class III",
    ]);
  });
});

describe("headerText", () => {
  it("firm_alias match → '🚨 <ALIAS> RECALLED' (uppercase)", () => {
    const j = job({ match_reason: "firm_alias", matched_value: "Acme Foods" });
    expect(headerText(j)).toBe("🚨 ACME FOODS RECALLED");
  });

  it("ingredient_category match → 'ℹ️ Peer recall in your <category> category'", () => {
    const j = job({ match_reason: "ingredient_category", matched_value: "protein" });
    expect(headerText(j)).toBe("ℹ️ Peer recall in your protein category");
  });

  it("category match preserves original casing of category name", () => {
    const j = job({ match_reason: "ingredient_category", matched_value: "herbals_botanicals" });
    expect(headerText(j)).toContain("herbals_botanicals");
  });
});

describe("buildBodyFields", () => {
  it("populates all fields from a fully-fleshed recall", () => {
    const r = recall();
    const f = buildBodyFields(r);
    expect(f.classification).toBe("Class II");
    expect(f.firm_name_raw).toBe("Ambrosia Brands LLC");
    expect(f.product_description).toBe("Whey protein powder, vanilla");
    expect(f.reason_for_recall).toBe("Undeclared milk allergen");
    expect(f.recall_initiation_date).toBe("2026-02-13");
    expect(f.recall_number).toBe("F-1234-2026");
  });

  it("renders null fields as 'N/A' (not literal 'null' or empty)", () => {
    const r = recall({
      classification: null,
      product_description: null,
      reason_for_recall: null,
      recall_initiation_date: null,
    });
    const f = buildBodyFields(r);
    expect(f.classification).toBe("Unknown");
    expect(f.product_description).toBe("N/A");
    expect(f.reason_for_recall).toBe("N/A");
    expect(f.recall_initiation_date).toBe("N/A");
  });

  it("URL-encodes the recall_number value inside %22<value>%22 in fda_url", () => {
    const r = recall({ recall_number: "F-1234-2026" });
    const f = buildBodyFields(r);
    // The query template is `recall_number:"<value>"` — colon and quotes are
    // baked literally; only the recall_number value passes through encodeURIComponent.
    expect(f.fda_url).toContain("recall_number:%22F-1234-2026%22");
  });

  it("URL-encodes recall_numbers containing reserved chars", () => {
    const r = recall({ recall_number: "F/1234 2026#X" });
    const f = buildBodyFields(r);
    expect(f.fda_url).toContain("F%2F1234%202026%23X");
  });
});

describe("nextAttemptAt", () => {
  it("attempt 1 → ~1m from now", () => {
    const before = Date.now();
    const t = nextAttemptAt(1).getTime();
    const after = Date.now();
    // Within ±5s of (now + 60000)
    expect(t).toBeGreaterThanOrEqual(before + 60_000 - 5_000);
    expect(t).toBeLessThanOrEqual(after + 60_000 + 5_000);
  });

  it("attempt 4 → ~1h from now", () => {
    const before = Date.now();
    const t = nextAttemptAt(4).getTime();
    expect(t).toBeGreaterThanOrEqual(before + 3_600_000 - 5_000);
    expect(t).toBeLessThanOrEqual(before + 3_600_000 + 5_000);
  });

  it("attempt 5+ clamps to longest backoff (does not throw)", () => {
    const before = Date.now();
    const t = nextAttemptAt(99).getTime();
    expect(t).toBeGreaterThanOrEqual(before + 3_600_000 - 5_000);
  });

  it("attempt 0 (defensive) clamps to first backoff", () => {
    const before = Date.now();
    const t = nextAttemptAt(0).getTime();
    expect(t).toBeGreaterThanOrEqual(before + 60_000 - 5_000);
  });
});

describe("MAX_ATTEMPTS", () => {
  it("is 5 (1 initial + 4 retries per backoff schedule)", () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
