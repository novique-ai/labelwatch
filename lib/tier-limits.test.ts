import { describe, expect, it } from "vitest";
import { TIER_BRAND_CAP, checkBrandCap } from "./tier-limits";

describe("TIER_BRAND_CAP", () => {
  it("locks the documented per-tier limits", () => {
    expect(TIER_BRAND_CAP.starter).toBe(1);
    expect(TIER_BRAND_CAP.pro).toBe(5);
    expect(TIER_BRAND_CAP.team).toBeNull();
  });
});

describe("checkBrandCap — starter", () => {
  it("allows firm_name alone (1 identity, cap=1)", () => {
    const v = checkBrandCap("starter", true, 0);
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(v.remaining).toBe(0);
  });

  it("allows a single alias when firm_name is missing", () => {
    const v = checkBrandCap("starter", false, 1);
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(v.remaining).toBe(0);
  });

  it("rejects firm_name + 1 alias (2 identities, cap=1)", () => {
    const v = checkBrandCap("starter", true, 1);
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.cap).toBe(1);
      expect(v.attempted).toBe(2);
      expect(v.tier).toBe("starter");
    }
  });
});

describe("checkBrandCap — pro", () => {
  it("allows firm_name + 4 aliases (5 identities, cap=5)", () => {
    const v = checkBrandCap("pro", true, 4);
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(v.remaining).toBe(0);
  });

  it("rejects firm_name + 5 aliases (6 identities, cap=5)", () => {
    const v = checkBrandCap("pro", true, 5);
    expect(v.allowed).toBe(false);
    if (!v.allowed) {
      expect(v.cap).toBe(5);
      expect(v.attempted).toBe(6);
    }
  });

  it("reports remaining capacity correctly mid-fill", () => {
    const v = checkBrandCap("pro", true, 2);
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(v.remaining).toBe(2);
  });
});

describe("checkBrandCap — team", () => {
  it("returns unlimited (cap=null) regardless of identity count", () => {
    const v = checkBrandCap("team", true, 49);
    expect(v.allowed).toBe(true);
    if (v.allowed) {
      expect(v.cap).toBeNull();
      expect(v.remaining).toBeNull();
    }
  });

  it("never rejects on team tier", () => {
    const v = checkBrandCap("team", false, 0);
    expect(v.allowed).toBe(true);
  });
});
