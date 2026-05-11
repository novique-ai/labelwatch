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

  it("does not flag ordinary benefit marketing claims just because they are absent from the SFP", () => {
    const listing: ListingExtract = {
      ingredients: [],
      claims: [
        { text: "Supports better muscle buffering and increased reps.", line: 4 },
        { text: "Enhanced energy, hydration, and workout performance.", line: 5 },
      ],
      warnings_surfaced: ["Keep out of reach of children."],
    };
    const findings = diffSfpVsListing(baseSfp, listing);
    expect(findings.some((f) => f.finding_type === "claim_drift")).toBe(false);
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

  it("does not flag ingredients declared in the label's Other Ingredients panel", () => {
    const sfp: SfpExtract = {
      ...baseSfp,
      other_ingredients: [
        "Natural and Artificial Flavor",
        "Citric Acid",
        "Calcium Silicate",
        "Silicon Dioxide",
        "Gum Blend (Cellulose Gum, Xanthan Gum, Carrageenan)",
        "Sucralose",
        "Tartaric Acid",
        "Malic Acid",
        "Acesulfame Potassium",
        "Red 40",
      ],
    };
    const listing: ListingExtract = {
      ingredients: [
        { name: "Sucralose", amount: null, line: 12 },
        { name: "Red 40", amount: null, line: 13 },
        { name: "Xanthan Gum", amount: null, line: 14 },
      ],
      claims: [],
      warnings_surfaced: ["Keep out of reach of children."],
    };
    const findings = diffSfpVsListing(sfp, listing);
    expect(findings.some((f) => f.finding_type === "ingredient_mismatch")).toBe(false);
  });

  it("matches trademarked SFP ingredient rows against listing rows with expanded sub-ingredients", () => {
    const sfp: SfpExtract = {
      ingredients: [
        { name: "Senactiv® (Panax notoginseng (root) Extract, Rosa roxburghii (fruit) Extract)", amount: "50 mg", daily_value_pct: "*" },
        { name: "AstraGin® (Astragalus membranaceus (root) Extract, Panax notoginseng (root) Extract)", amount: "50 mg", daily_value_pct: "*" },
        { name: "Caffeine Blend (Rapid Release as Caffeine Anhydrous (200 mg), Targeted Release as ZümXR® Caffeine (50 mg))", amount: "250 mg", daily_value_pct: "*" },
        { name: "Includes 0 g Added Sugars", amount: "0 g", daily_value_pct: "0%†" },
      ],
      claims: [],
      serving_size: "One Scoop",
      warnings: [],
    };
    const listing: ListingExtract = {
      ingredients: [
        { name: "Senactiv (Panax notoginseng root extract and Rosa roxburghii fruit extract)", amount: "50 mg", line: 16 },
        { name: "AstraGin (Astragalus membranaceus root extract and Panax notoginseng root extract)", amount: "50 mg", line: 16 },
        { name: "Caffeine Blend (Caffeine Anhydrous 200 mg and ZümXR Caffeine 50 mg)", amount: "250 mg", line: 16 },
        { name: "Added Sugars", amount: "0 g", line: 16 },
      ],
      claims: [],
      warnings_surfaced: [],
    };
    const findings = diffSfpVsListing(sfp, listing);
    expect(findings.some((f) => f.finding_type === "ingredient_mismatch")).toBe(false);
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

  it("does not treat SFP daily-value footnotes as missing warnings", () => {
    const sfp: SfpExtract = {
      ...baseSfp,
      warnings: [
        "† Percent Daily Values are based on a 2,000 calorie diet.",
        "* Daily Value not established.",
      ],
    };
    const listing: ListingExtract = {
      ingredients: [],
      claims: [],
      warnings_surfaced: [],
    };
    const findings = diffSfpVsListing(sfp, listing);
    expect(findings.some((f) => f.finding_type === "missing_warning")).toBe(false);
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
