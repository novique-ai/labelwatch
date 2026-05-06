// Unit tests for lib/match-rules.ts — bead infrastructure-xv3f.
// Tests pure functions only; no Supabase, no I/O. Mirrors lib/audit-diff.test.ts.

import { describe, expect, it } from "vitest";
import {
  classifyRecallIngredients,
  isRecallEligibleForChannel,
  matchCandidates,
  matchFirmAliases,
  recallClassToSeverity,
  SEVERITY_CLASS_RANK,
} from "./match-rules";
import type {
  CustomerChannelRow,
  CustomerProfileRow,
  RecallRow,
} from "@/types/database.types";

// -- Test fixtures -----------------------------------------------------------

function profile(overrides: Partial<CustomerProfileRow> = {}): CustomerProfileRow {
  return {
    id: "profile-1",
    customer_id: "cust-1",
    firm_id: null,
    firm_aliases: [],
    ingredient_categories: [],
    severity_preferences: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function channel(overrides: Partial<CustomerChannelRow> = {}): CustomerChannelRow {
  return {
    id: "channel-1",
    customer_id: "cust-1",
    type: "slack",
    config: { webhook_url: "https://hooks.slack.com/services/T/B/X" },
    enabled: true,
    severity_filter: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function recall(overrides: Partial<RecallRow> = {}): Pick<
  RecallRow,
  "id" | "classification" | "product_description" | "reason_for_recall"
> {
  return {
    id: "recall-1",
    classification: "Class II",
    product_description: "",
    reason_for_recall: "",
    ...overrides,
  };
}

// -- recallClassToSeverity ---------------------------------------------------

describe("recallClassToSeverity", () => {
  it("maps each Class N to its Roman numeral", () => {
    expect(recallClassToSeverity("Class I")).toBe("I");
    expect(recallClassToSeverity("Class II")).toBe("II");
    expect(recallClassToSeverity("Class III")).toBe("III");
  });
  it("returns null for unknown / null inputs", () => {
    expect(recallClassToSeverity(null)).toBeNull();
    expect(recallClassToSeverity("Class IV")).toBeNull();
    expect(recallClassToSeverity("")).toBeNull();
  });
});

// -- classifyRecallIngredients ------------------------------------------------

describe("classifyRecallIngredients", () => {
  it("matches whey protein → ['protein']", () => {
    const r = recall({
      product_description: "Whey protein powder, vanilla",
      reason_for_recall: "Undeclared milk allergen",
    });
    expect(classifyRecallIngredients(r)).toContain("protein");
  });

  it("matches multiple categories from combined description + reason text", () => {
    const r = recall({
      product_description: "Probiotic + Vitamin D gummy",
      reason_for_recall: "Salmonella contamination",
    });
    const cats = classifyRecallIngredients(r);
    expect(cats).toContain("vitamins");
    expect(cats).toContain("probiotics");
    expect(cats).toContain("childrens"); // "gummy"
  });

  it("returns [] for fully unmatched text (does NOT default to 'other')", () => {
    const r = recall({
      product_description: "Sodium fluoride mouthwash",
      reason_for_recall: "Mislabeled cap",
    });
    expect(classifyRecallIngredients(r)).toEqual([]);
  });

  it("handles null / empty fields", () => {
    const r = recall({ product_description: null, reason_for_recall: null });
    expect(classifyRecallIngredients(r)).toEqual([]);
  });

  it("is case-insensitive", () => {
    const r = recall({
      product_description: "WHEY PROTEIN ISOLATE",
      reason_for_recall: "",
    });
    expect(classifyRecallIngredients(r)).toContain("protein");
  });
});

// -- matchFirmAliases --------------------------------------------------------

describe("matchFirmAliases", () => {
  it("returns the matched alias on exact normalized equality", () => {
    expect(matchFirmAliases("ambrosia brands llc", ["ambrosia brands llc", "ambrosia"]))
      .toBe("ambrosia brands llc");
  });
  it("returns null on no match", () => {
    expect(matchFirmAliases("acme inc", ["sl26 smoke test co"])).toBeNull();
  });
  it("returns null on empty firm name", () => {
    expect(matchFirmAliases("", ["whatever"])).toBeNull();
  });
});

// -- isRecallEligibleForChannel ----------------------------------------------

describe("isRecallEligibleForChannel — severity gate", () => {
  it("Class III recall with default_min_class=II → false", () => {
    expect(
      isRecallEligibleForChannel({
        recallClass: "Class III",
        channelType: "slack",
        severityPrefs: { default_min_class: "II" },
      }),
    ).toBe(false);
  });

  it("Class I recall with default_min_class=II → true (I is more severe)", () => {
    expect(
      isRecallEligibleForChannel({
        recallClass: "Class I",
        channelType: "slack",
        severityPrefs: { default_min_class: "II" },
      }),
    ).toBe(true);
  });

  it("empty {} severity_preferences → true (send-all)", () => {
    expect(
      isRecallEligibleForChannel({
        recallClass: "Class III",
        channelType: "slack",
        severityPrefs: {},
      }),
    ).toBe(true);
  });

  it("per_channel override: slack=III lets Class III through even with default_min_class=I", () => {
    expect(
      isRecallEligibleForChannel({
        recallClass: "Class III",
        channelType: "slack",
        severityPrefs: {
          default_min_class: "I",
          per_channel: { slack: { min_class: "III" } },
        },
      }),
    ).toBe(true);
  });

  it("per_channel for other channel types does NOT affect this channel — falls back to default", () => {
    expect(
      isRecallEligibleForChannel({
        recallClass: "Class III",
        channelType: "email",
        severityPrefs: {
          default_min_class: "I",
          per_channel: { slack: { min_class: "III" } },
        },
      }),
    ).toBe(false);
  });

  it("classification=null → false (don't deliver unclassified recalls)", () => {
    expect(
      isRecallEligibleForChannel({
        recallClass: null,
        channelType: "slack",
        severityPrefs: { default_min_class: "III" },
      }),
    ).toBe(false);
  });
});

// -- channel.severity_filter precedence (bead infrastructure-dxkk) -----------

describe("isRecallEligibleForChannel — channel.severity_filter (dxkk)", () => {
  it("channel filter overrides profile default (more permissive)", () => {
    // Profile says I-only; channel says III-or-higher → Class III passes.
    expect(
      isRecallEligibleForChannel({
        recallClass: "Class III",
        channelType: "slack",
        severityPrefs: { default_min_class: "I" },
        channelSeverityFilter: { min_class: "III" },
      }),
    ).toBe(true);
  });

  it("channel filter overrides profile default (more restrictive)", () => {
    // Profile says III-or-higher; channel says I-only → Class III rejected.
    expect(
      isRecallEligibleForChannel({
        recallClass: "Class III",
        channelType: "slack",
        severityPrefs: { default_min_class: "III" },
        channelSeverityFilter: { min_class: "I" },
      }),
    ).toBe(false);
  });

  it("channel filter wins over legacy per_channel JSON", () => {
    // Both set, channel filter takes precedence (most specific source).
    expect(
      isRecallEligibleForChannel({
        recallClass: "Class III",
        channelType: "slack",
        severityPrefs: {
          default_min_class: "II",
          per_channel: { slack: { min_class: "II" } },
        },
        channelSeverityFilter: { min_class: "III" },
      }),
    ).toBe(true);
  });

  it("null channel filter falls through to profile default", () => {
    expect(
      isRecallEligibleForChannel({
        recallClass: "Class III",
        channelType: "slack",
        severityPrefs: { default_min_class: "II" },
        channelSeverityFilter: null,
      }),
    ).toBe(false);
  });

  it("undefined channel filter falls through to profile default", () => {
    expect(
      isRecallEligibleForChannel({
        recallClass: "Class III",
        channelType: "slack",
        severityPrefs: { default_min_class: "II" },
      }),
    ).toBe(false);
  });
});

// -- matchCandidates (top-level) ---------------------------------------------

describe("matchCandidates", () => {
  it("firm_alias hit emits one candidate per channel with matchReason='firm_alias'", () => {
    const r = recall({
      classification: "Class I",
      product_description: "Whey protein powder",
    });
    const result = matchCandidates({
      recall: r,
      normalizedFirmName: "ambrosia brands llc",
      recallCategories: ["protein"],
      customers: [
        {
          profile: profile({
            firm_aliases: ["ambrosia brands llc"],
            ingredient_categories: ["protein"],
            severity_preferences: { default_min_class: "III" },
          }),
          channels: [channel({ id: "ch-slack", type: "slack" })],
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].matchReason).toBe("firm_alias");
    expect(result[0].matchedValue).toBe("ambrosia brands llc");
    expect(result[0].customerChannelId).toBe("ch-slack");
    expect(result[0].severityClass).toBe("Class I");
  });

  it("ingredient_category-only hit emits with matchReason='ingredient_category'", () => {
    const r = recall({
      classification: "Class II",
      product_description: "Multivitamin gummy",
    });
    const result = matchCandidates({
      recall: r,
      normalizedFirmName: "some unrelated firm",
      recallCategories: ["vitamins", "childrens"],
      customers: [
        {
          profile: profile({
            firm_aliases: ["different firm"],
            ingredient_categories: ["vitamins"],
            severity_preferences: { default_min_class: "II" },
          }),
          channels: [channel({ id: "ch-email", type: "email" })],
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].matchReason).toBe("ingredient_category");
    expect(result[0].matchedValue).toBe("vitamins");
  });

  it("disabled channels are pre-filtered (caller's responsibility — no candidates emitted if no enabled channels)", () => {
    // Simulating the upstream filter: caller passes only enabled channels.
    const result = matchCandidates({
      recall: recall({ classification: "Class I" }),
      normalizedFirmName: "ambrosia",
      recallCategories: [],
      customers: [
        {
          profile: profile({ firm_aliases: ["ambrosia"], severity_preferences: {} }),
          channels: [], // empty = nothing enabled
        },
      ],
    });
    expect(result).toEqual([]);
  });

  it("severity gate filters out Class III when default_min_class=II", () => {
    const result = matchCandidates({
      recall: recall({ classification: "Class III" }),
      normalizedFirmName: "ambrosia",
      recallCategories: ["protein"],
      customers: [
        {
          profile: profile({
            firm_aliases: ["ambrosia"],
            ingredient_categories: ["protein"],
            severity_preferences: { default_min_class: "II" },
          }),
          channels: [channel({ id: "ch-1" })],
        },
      ],
    });
    expect(result).toEqual([]);
  });

  it("classification=null short-circuits to []", () => {
    const result = matchCandidates({
      recall: recall({ classification: null }),
      normalizedFirmName: "ambrosia",
      recallCategories: ["protein"],
      customers: [
        {
          profile: profile({
            firm_aliases: ["ambrosia"],
            severity_preferences: {},
          }),
          channels: [channel()],
        },
      ],
    });
    expect(result).toEqual([]);
  });

  it("alias hit takes precedence over category hit on the same channel", () => {
    const result = matchCandidates({
      recall: recall({ classification: "Class I" }),
      normalizedFirmName: "ambrosia",
      recallCategories: ["protein", "vitamins"],
      customers: [
        {
          profile: profile({
            firm_aliases: ["ambrosia"],
            ingredient_categories: ["protein"],
            severity_preferences: {},
          }),
          channels: [channel({ id: "ch-1" })],
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].matchReason).toBe("firm_alias");
  });
});

// -- SEVERITY_CLASS_RANK invariants ------------------------------------------

describe("SEVERITY_CLASS_RANK", () => {
  it("Class I (most severe) ranks highest", () => {
    expect(SEVERITY_CLASS_RANK.I).toBeGreaterThan(SEVERITY_CLASS_RANK.II);
    expect(SEVERITY_CLASS_RANK.II).toBeGreaterThan(SEVERITY_CLASS_RANK.III);
  });
});
