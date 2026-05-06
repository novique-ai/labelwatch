// Tier-based limits across LabelWatch surfaces. Pure functions only — no
// Supabase, no I/O. Enforcement sites import these and either gate user
// input (UI) or reject the request (API).
//
// Bead: infrastructure-0a0x (brand cap). Sibling beads under epic
// infrastructure-azn9 will add per-channel + per-history limits next to
// this file.

import type { Tier } from "@/types/database.types";

// Per-tier cap on the number of distinct brand identities a customer can
// monitor. A "brand identity" is the customer's billing firm_name plus
// each firm_alias (DBA / subsidiary / name variant for openFDA matching).
//
// Tier intent:
//   starter — single brand, no aliases (just firm_name).
//   pro     — multi-SKU brand portfolio (firm_name + up to 4 aliases).
//   team    — unlimited (a 50-row UX safety stays in /api/onboard).
export const TIER_BRAND_CAP: Record<Tier, number | null> = {
  starter: 1,
  pro: 5,
  team: null,
};

export type BrandCapVerdict =
  | { allowed: true; cap: number | null; remaining: number | null }
  | { allowed: false; tier: Tier; cap: number; attempted: number };

// Counts a present billing firm_name plus every alias as one identity.
export function checkBrandCap(
  tier: Tier,
  hasFirmName: boolean,
  aliasCount: number,
): BrandCapVerdict {
  const identities = (hasFirmName ? 1 : 0) + aliasCount;
  const cap = TIER_BRAND_CAP[tier];
  if (cap === null) {
    return { allowed: true, cap: null, remaining: null };
  }
  if (identities > cap) {
    return { allowed: false, tier, cap, attempted: identities };
  }
  return { allowed: true, cap, remaining: cap - identities };
}
