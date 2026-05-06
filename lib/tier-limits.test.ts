import { describe, expect, it } from "vitest";
import {
  TIER_ALLOWED_CHANNEL_TYPES,
  TIER_BRAND_CAP,
  TIER_CHANNEL_CAP,
  checkBrandCap,
  checkChannelAdd,
  isChannelTypeAllowed,
} from "./tier-limits";

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

describe("TIER_CHANNEL_CAP + TIER_ALLOWED_CHANNEL_TYPES", () => {
  it("locks the documented per-tier limits", () => {
    expect(TIER_CHANNEL_CAP.starter).toBe(1);
    expect(TIER_CHANNEL_CAP.pro).toBe(3);
    expect(TIER_CHANNEL_CAP.team).toBeNull();
  });

  it("starter allows email + slack only", () => {
    expect([...TIER_ALLOWED_CHANNEL_TYPES.starter].sort()).toEqual(["email", "slack"]);
  });

  it("pro and team allow all four types", () => {
    expect([...TIER_ALLOWED_CHANNEL_TYPES.pro].sort()).toEqual([
      "email",
      "http",
      "slack",
      "teams",
    ]);
    expect([...TIER_ALLOWED_CHANNEL_TYPES.team].sort()).toEqual([
      "email",
      "http",
      "slack",
      "teams",
    ]);
  });
});

describe("isChannelTypeAllowed", () => {
  it("rejects teams + http for starter", () => {
    expect(isChannelTypeAllowed("starter", "teams")).toBe(false);
    expect(isChannelTypeAllowed("starter", "http")).toBe(false);
  });

  it("accepts email + slack for starter", () => {
    expect(isChannelTypeAllowed("starter", "email")).toBe(true);
    expect(isChannelTypeAllowed("starter", "slack")).toBe(true);
  });

  it("accepts every type for pro and team", () => {
    for (const type of ["slack", "teams", "http", "email"] as const) {
      expect(isChannelTypeAllowed("pro", type)).toBe(true);
      expect(isChannelTypeAllowed("team", type)).toBe(true);
    }
  });
});

describe("checkChannelAdd — starter", () => {
  it("allows the first email channel", () => {
    const v = checkChannelAdd("starter", "email", 0);
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(v.remaining).toBe(0);
  });

  it("rejects a second channel (cap=1)", () => {
    const v = checkChannelAdd("starter", "email", 1);
    expect(v.allowed).toBe(false);
    if (!v.allowed && v.reason === "cap_exceeded") {
      expect(v.cap).toBe(1);
      expect(v.current).toBe(1);
    } else {
      throw new Error("expected cap_exceeded");
    }
  });

  it("rejects teams type even when count is 0", () => {
    const v = checkChannelAdd("starter", "teams", 0);
    expect(v.allowed).toBe(false);
    if (!v.allowed && v.reason === "type_not_allowed") {
      expect(v.type).toBe("teams");
      expect(v.tier).toBe("starter");
    } else {
      throw new Error("expected type_not_allowed");
    }
  });
});

describe("checkChannelAdd — pro", () => {
  it("allows the third channel (cap=3)", () => {
    const v = checkChannelAdd("pro", "http", 2);
    expect(v.allowed).toBe(true);
    if (v.allowed) expect(v.remaining).toBe(0);
  });

  it("rejects the fourth channel", () => {
    const v = checkChannelAdd("pro", "teams", 3);
    expect(v.allowed).toBe(false);
    if (!v.allowed && v.reason === "cap_exceeded") {
      expect(v.cap).toBe(3);
    }
  });

  it("type_not_allowed wins over cap_exceeded when both apply", () => {
    // Starter + 1 existing + teams type — type check should fire first,
    // matching the implementation order. Documents the behavior so a
    // future refactor doesn't accidentally reorder the checks.
    const v = checkChannelAdd("starter", "teams", 1);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reason).toBe("type_not_allowed");
  });
});

describe("checkChannelAdd — team", () => {
  it("allows any number of any type", () => {
    for (const type of ["slack", "teams", "http", "email"] as const) {
      const v = checkChannelAdd("team", type, 99);
      expect(v.allowed).toBe(true);
      if (v.allowed) {
        expect(v.cap).toBeNull();
        expect(v.remaining).toBeNull();
      }
    }
  });
});
