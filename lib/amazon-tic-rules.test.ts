import { describe, expect, it } from "vitest";
import type { IngredientCategory } from "@/types/database.types";
import {
  AMAZON_TIC_POLICY_URL,
  CATEGORY_DISPLAY_NAMES,
  getRulesForCategories,
  last_reviewed,
  RULESET_LAST_REVIEWED,
} from "./amazon-tic-rules";

describe("amazon TIC ruleset citations", () => {
  it("exports last_reviewed metadata", () => {
    expect(last_reviewed).toBe(RULESET_LAST_REVIEWED);
    expect(last_reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has no fabricated Amazon policy section citations", () => {
    const categories = Object.keys(CATEGORY_DISPLAY_NAMES) as IngredientCategory[];
    const references = getRulesForCategories(categories).map((rule) => rule.reference);

    expect(references).not.toContain("");
    for (const reference of references) {
      expect(reference).not.toMatch(/Amazon.*§/);
    }
  });

  it("uses the canonical Seller Central URL for Amazon policy references", () => {
    const categories = Object.keys(CATEGORY_DISPLAY_NAMES) as IngredientCategory[];
    const amazonReferences = getRulesForCategories(categories)
      .map((rule) => rule.reference)
      .filter((reference) => /Amazon|Seller Central/.test(reference));

    expect(amazonReferences.length).toBeGreaterThan(0);
    for (const reference of amazonReferences) {
      expect(reference).toContain(AMAZON_TIC_POLICY_URL);
    }
  });
});
