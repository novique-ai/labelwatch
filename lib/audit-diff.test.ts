import { describe, expect, it } from "vitest";
import { diffSfpVsListing, summarizeFindings } from "./audit-diff";
import type { ListingExtract, SfpExtract } from "@/types/database.types";

const baseSfp: SfpExtract = {
  ingredients: [
    { name: "Vitamin C", amount: "500mg", daily_value_pct: "555%" },
    { name: "Zinc", amount: "15mg", daily_value_pct: "136%" },
  ],
  claims: [],
  serving_size: "1 capsule daily",
  warnings: ["Keep out of reach of children."],
};

describe("diffSfpVsListing", () => {
  it("flags a high-severity claim_drift for disease/treatment language", () => {
    const listing: ListingExtract = {
      ingredients: [],
      claims: [{ text: "Cures the common cold.", line: 4 }],
      warnings_surfaced: [],
    };
    const findings = diffSfpVsListing(baseSfp, listing);
    const drift = findings.find((f) => f.finding_type === "claim_drift");
    expect(drift).toBeDefined();
    expect(drift?.severity).toBe("high");
    expect(drift?.listing_line).toBe(4);
  });

  it("flags ingredient_mismatch when listing amount disagrees with SFP", () => {
    const listing: ListingExtract = {
      ingredients: [{ name: "Vitamin C", amount: "1000mg", line: 7 }],
      claims: [],
      warnings_surfaced: ["Keep out of reach of children."],
    };
    const findings = diffSfpVsListing(baseSfp, listing);
    expect(findings.some((f) => f.finding_type === "ingredient_mismatch")).toBe(true);
    const mismatch = findings.find((f) => f.finding_type === "ingredient_mismatch")!;
    expect(mismatch.severity).toBe("high");
    expect(mismatch.sfp_reference).toBe("Vitamin C");
  });

  it("flags ingredient_mismatch when listing names an ingredient not on the SFP", () => {
    const listing: ListingExtract = {
      ingredients: [{ name: "Ashwagandha", amount: "300mg", line: 9 }],
      claims: [],
      warnings_surfaced: ["Keep out of reach of children."],
    };
    const findings = diffSfpVsListing(baseSfp, listing);
    const phantom = findings.find(
      (f) =>
        f.finding_type === "ingredient_mismatch" && f.excerpt === "Ashwagandha",
    );
    expect(phantom).toBeDefined();
    expect(phantom?.severity).toBe("high");
  });

  it("flags missing_warning when SFP warning is not surfaced in listing", () => {
    const listing: ListingExtract = {
      ingredients: [],
      claims: [],
      warnings_surfaced: [],
    };
    const findings = diffSfpVsListing(baseSfp, listing);
    const missing = findings.find((f) => f.finding_type === "missing_warning");
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe("medium");
  });

  it("returns no findings when listing matches SFP perfectly", () => {
    const listing: ListingExtract = {
      ingredients: [
        { name: "Vitamin C", amount: "500mg", line: 1 },
        { name: "Zinc", amount: "15mg", line: 2 },
      ],
      claims: [],
      warnings_surfaced: ["Keep out of reach of children."],
    };
    const findings = diffSfpVsListing(baseSfp, listing);
    expect(findings).toEqual([]);
  });

  it("normalizes ingredient names so 'Vit C' matches 'Vitamin C'", () => {
    const listing: ListingExtract = {
      ingredients: [{ name: "Vit C", amount: "500mg", line: 1 }],
      claims: [],
      warnings_surfaced: ["Keep out of reach of children."],
    };
    const findings = diffSfpVsListing(baseSfp, listing);
    expect(findings.some((f) => f.finding_type === "ingredient_mismatch")).toBe(false);
  });
});

describe("summarizeFindings", () => {
  it("returns the highest severity across all findings", () => {
    expect(
      summarizeFindings([
        {
          finding_type: "claim_drift",
          severity: "low",
          excerpt: "x",
          detail: null,
          sfp_reference: null,
          listing_line: 1,
        },
        {
          finding_type: "claim_drift",
          severity: "high",
          excerpt: "y",
          detail: null,
          sfp_reference: null,
          listing_line: 2,
        },
        {
          finding_type: "missing_warning",
          severity: "medium",
          excerpt: "z",
          detail: null,
          sfp_reference: "z",
          listing_line: null,
        },
      ]),
    ).toEqual({ count: 3, severityMax: "high" });
  });

  it("returns null severity for empty findings", () => {
    expect(summarizeFindings([])).toEqual({ count: 0, severityMax: null });
  });
});
