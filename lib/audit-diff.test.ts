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

  it("treats equivalent gram and milligram amounts as matching", () => {
    const sfp: SfpExtract = {
      ingredients: [
        { name: "L-Arginine (Free-Form)", amount: "1 g (1,000 mg)", daily_value_pct: "**" },
      ],
      claims: [],
      serving_size: "2 capsules",
      warnings: [],
    };
    const listing: ListingExtract = {
      ingredients: [{ name: "L-Arginine (free-form)", amount: "1000 mg", line: 1 }],
      claims: [],
      warnings_surfaced: [],
    };
    const findings = diffSfpVsListing(sfp, listing);
    expect(findings.filter((f) => f.finding_type === "ingredient_mismatch")).toEqual([]);
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
    expect(findings.filter((f) => f.finding_type === "ingredient_mismatch")).toEqual([]);
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

  it("matches common vitamin and botanical alias names", () => {
    const sfp: SfpExtract = {
      ingredients: [
        { name: "Piper nigrum Extract (fruit)", amount: "2.5 mg", daily_value_pct: "†" },
      ],
      other_ingredients: [
        "Nicotinamide",
        "Calcium D-Pantothenate",
      ],
      claims: [],
      serving_size: "1 scoop",
      warnings: [],
    };
    const listing: ListingExtract = {
      ingredients: [
        { name: "piperine", amount: null, line: 1 },
        { name: "niacin", amount: null, line: 1 },
        { name: "pantothenic acid", amount: null, line: 1 },
      ],
      claims: [],
      warnings_surfaced: [],
    };
    const findings = diffSfpVsListing(sfp, listing);
    expect(findings.some((f) => f.finding_type === "ingredient_mismatch")).toBe(false);
  });

  it("matches common additive and vitamin aliases from OCR/listing variants", () => {
    const sfp: SfpExtract = {
      ingredients: [
        { name: "PerforMelon™ (Citrullus lanatus, fruit)", amount: "100 mg", daily_value_pct: "*" },
      ],
      other_ingredients: [
        "Riboflavin",
        "Carboxymethylcellulose Sodium",
        "Gelatin",
        "Cocoa",
      ],
      claims: [],
      serving_size: "1 scoop",
      warnings: [],
    };
    const listing: ListingExtract = {
      ingredients: [
        { name: "PerforMelon Citrullus lanatus fruit", amount: null, line: 1 },
        { name: "Riboflavin (Vitamin B2)", amount: null, line: 1 },
        { name: "Cellulose Gum", amount: null, line: 1 },
        { name: "Gelatine", amount: null, line: 1 },
        { name: "Cocoa Powder", amount: null, line: 1 },
      ],
      claims: [],
      warnings_surfaced: [],
    };
    const findings = diffSfpVsListing(sfp, listing);
    expect(findings.filter((f) => f.finding_type === "ingredient_mismatch")).toEqual([]);
  });

  it("matches common protein-powder label vocabulary variants", () => {
    const sfp: SfpExtract = {
      ingredients: [],
      other_ingredients: [
        "Whey Protein Isolate",
        "Whey Protein Concentrate",
        "Chocolate Cookie Pieces (Wheat Flour, Sugar, Palm Oil, Cocoa Powder, Salt, Sodium Bicarbonate, Soy Lecithin)",
        "Flavour",
        "Soy Lecithin",
        "Xanthan Gum",
        "Sucralose",
      ],
      claims: [],
      serving_size: "32 g",
      warnings: [],
    };
    const listing: ListingExtract = {
      ingredients: [
        { name: "Whey Protein Blend", amount: null, line: 1 },
        { name: "Milk Whey Protein Isolate", amount: null, line: 1 },
        { name: "Flavorings", amount: null, line: 1 },
        { name: "Cookie Crumb", amount: null, line: 1 },
        { name: "Gluten", amount: null, line: 1 },
        { name: "Vegetable Fats", amount: null, line: 1 },
        { name: "Sodium Chloride", amount: null, line: 1 },
        { name: "Sucralose (Sweetener)", amount: null, line: 1 },
      ],
      claims: [],
      warnings_surfaced: [],
    };
    const findings = diffSfpVsListing(sfp, listing);
    expect(findings.filter((f) => f.finding_type === "ingredient_mismatch")).toEqual([]);
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

  it("treats warning text extracted as listing claims as surfaced warning text", () => {
    const sfp: SfpExtract = {
      ...baseSfp,
      warnings: [
        "Not manufactured with wheat, gluten, soy, milk, egg, fish, shellfish or tree nut ingredients. Produced in a GMP facility that processes other ingredients containing these allergens.",
      ],
    };
    const listing: ListingExtract = {
      ingredients: [],
      claims: [
        {
          text: "Not manufactured with wheat, gluten, soy, milk, egg, fish, shellfish or tree nut ingredients.",
          line: 3,
        },
        {
          text: "Produced in a GMP facility that processes other ingredients containing these allergens.",
          line: 4,
        },
      ],
      warnings_surfaced: [],
    };
    const findings = diffSfpVsListing(sfp, listing);
    expect(findings.some((f) => f.finding_type === "missing_warning")).toBe(false);
  });

  it("does not treat storage and lot-code text as missing warnings", () => {
    const sfp: SfpExtract = {
      ...baseSfp,
      warnings: [
        "STORE IN A COOL, DRY PLACE. DO NOT REFRIGERATE. BEST BEFORE END: SEE BOTTOM OF CONTAINER. LOT NUMBER: SEE BOTTOM OF CONTAINER.",
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

  it("uses listing ingredient names as surfaced allergen warning evidence", () => {
    const sfp: SfpExtract = {
      ...baseSfp,
      warnings: ["GLUTEN: Contains Gluten."],
    };
    const listing: ListingExtract = {
      ingredients: [{ name: "Gluten", amount: null, line: 1 }],
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
