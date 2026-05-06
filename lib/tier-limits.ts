// Tier-based limits across LabelWatch surfaces. Pure functions only — no
// Supabase, no I/O. Enforcement sites import these and either gate user
// input (UI) or reject the request (API).
//
// Beads under epic infrastructure-azn9:
//   - 0a0x — brand cap (firm_aliases count)
//   - gvqx — channel cap + channel-type allowlist
// Sibling beads (history window, severity routing, cadence split) land here
// as they ship.

import type { ChannelType, Tier } from "@/types/database.types";

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

// Per-tier cap on the total number of delivery channels a customer can
// configure across all types. Cap is enforced at /api/onboard (always 1
// channel at first onboard, so cap satisfied), /api/account/channels POST,
// and /api/slack/oauth/callback (account flow). null = unlimited.
//
// Bead infrastructure-gvqx.
export const TIER_CHANNEL_CAP: Record<Tier, number | null> = {
  starter: 1,
  pro: 3,
  team: null,
};

// Per-tier allowlist for channel types. Starter gets Slack + email only;
// Pro+ unlocks Microsoft Teams and generic HTTP webhooks.
export const TIER_ALLOWED_CHANNEL_TYPES: Record<Tier, ReadonlyArray<ChannelType>> = {
  starter: ["email", "slack"],
  pro: ["email", "slack", "teams", "http"],
  team: ["email", "slack", "teams", "http"],
};

export type ChannelAddVerdict =
  | { allowed: true; cap: number | null; remaining: number | null }
  | { allowed: false; reason: "type_not_allowed"; tier: Tier; type: ChannelType }
  | {
      allowed: false;
      reason: "cap_exceeded";
      tier: Tier;
      cap: number;
      current: number;
    };

export function isChannelTypeAllowed(tier: Tier, type: ChannelType): boolean {
  return TIER_ALLOWED_CHANNEL_TYPES[tier].includes(type);
}

// Combined check: enforces both the type allowlist and the channel-count cap.
// Caller passes the customer's CURRENT channel count (i.e. count of rows in
// customer_channels at the time of the add attempt, not including the new
// row). Returns `remaining` post-add for UX hinting (null = unlimited).
export function checkChannelAdd(
  tier: Tier,
  type: ChannelType,
  currentCount: number,
): ChannelAddVerdict {
  if (!isChannelTypeAllowed(tier, type)) {
    return { allowed: false, reason: "type_not_allowed", tier, type };
  }
  const cap = TIER_CHANNEL_CAP[tier];
  if (cap !== null && currentCount >= cap) {
    return { allowed: false, reason: "cap_exceeded", tier, cap, current: currentCount };
  }
  return {
    allowed: true,
    cap,
    remaining: cap === null ? null : cap - currentCount - 1,
  };
}
