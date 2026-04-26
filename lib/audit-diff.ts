// Pure-fn diff between an extracted SFP and an extracted listing.
// No I/O. Easy to unit test.

import type {
  AuditFindingType,
  AuditSeverity,
  ListingExtract,
  SfpExtract,
  SfpIngredient,
} from "@/types/database.types";

export type DiffFinding = {
  finding_type: AuditFindingType;
  severity: AuditSeverity;
  excerpt: string;
  detail: string | null;
  sfp_reference: string | null;
  listing_line: number | null;
};

const HIGH_RISK_CLAIM_PATTERNS: RegExp[] = [
  /\bcure[sd]?\b/i,
  /\btreats?\b/i,
  /\bprevent[s]?\b/i,
  /\bdiagnos(e|is|tic)\b/i,
  /\bFDA[- ]approved\b/i,
];

function normalizeIngredientName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bvit\b/g, "vitamin")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAmount(s: string | null): string | null {
  if (!s) return null;
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/micrograms?/g, "mcg")
    .replace(/milligrams?/g, "mg")
    .replace(/grams?\b/g, "g")
    .replace(/international\s*units?/g, "iu");
}

function severityForClaim(claimText: string): AuditSeverity {
  for (const pat of HIGH_RISK_CLAIM_PATTERNS) {
    if (pat.test(claimText)) return "high";
  }
  return "medium";
}

function maxSeverity(a: AuditSeverity, b: AuditSeverity): AuditSeverity {
  const rank: Record<AuditSeverity, number> = { low: 0, medium: 1, high: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export function diffSfpVsListing(
  sfp: SfpExtract,
  listing: ListingExtract,
): DiffFinding[] {
  const findings: DiffFinding[] = [];

  const sfpIngredientByName = new Map<string, SfpIngredient>();
  for (const ing of sfp.ingredients) {
    sfpIngredientByName.set(normalizeIngredientName(ing.name), ing);
  }
  const sfpClaimsNormalized = new Set(
    sfp.claims.map((c) => c.toLowerCase().trim()).filter((c) => c.length > 0),
  );

  // 1) claim_drift: listing claim not supported by SFP claim or any benign default.
  // For MVP1 we treat ANY claim not present in the SFP claims set as a drift candidate.
  // The SFP rarely carries benefit claims, so most listing claims will flag — that's
  // intentional: the customer-facing audit calls out all claims for review, and the
  // severity field tells them which ones are dangerous (cure/treat/prevent → high).
  for (const claim of listing.claims) {
    const norm = claim.text.toLowerCase().trim();
    if (sfpClaimsNormalized.has(norm)) continue;
    findings.push({
      finding_type: "claim_drift",
      severity: severityForClaim(claim.text),
      excerpt: claim.text,
      detail:
        "Marketing claim in the listing is not stated on the Supplement Facts Panel. Review for substantiation; high-severity findings reference disease/treatment language and should be removed.",
      sfp_reference: null,
      listing_line: claim.line,
    });
  }

  // 2) ingredient_mismatch: listing names an amount that disagrees with SFP, or
  //    listing names an ingredient not on the SFP at all.
  for (const mention of listing.ingredients) {
    const key = normalizeIngredientName(mention.name);
    const sfpRow = sfpIngredientByName.get(key);
    if (!sfpRow) {
      findings.push({
        finding_type: "ingredient_mismatch",
        severity: "high",
        excerpt: mention.name,
        detail:
          "Listing references an ingredient that is not present on the Supplement Facts Panel.",
        sfp_reference: null,
        listing_line: mention.line,
      });
      continue;
    }
    const listingAmt = normalizeAmount(mention.amount);
    const sfpAmt = normalizeAmount(sfpRow.amount);
    if (listingAmt && sfpAmt && listingAmt !== sfpAmt) {
      findings.push({
        finding_type: "ingredient_mismatch",
        severity: "high",
        excerpt: `${mention.name}: listing says ${mention.amount}, SFP says ${sfpRow.amount}`,
        detail: "Amount disagrees between listing copy and SFP.",
        sfp_reference: sfpRow.name,
        listing_line: mention.line,
      });
    }
  }

  // 3) missing_warning: SFP carries a warning that the listing copy never surfaces.
  const surfacedNorm = new Set(
    listing.warnings_surfaced.map((w) => w.toLowerCase().trim()),
  );
  for (const warning of sfp.warnings) {
    const norm = warning.toLowerCase().trim();
    if (norm.length === 0) continue;
    const surfaced = [...surfacedNorm].some(
      (s) => s.includes(norm) || norm.includes(s),
    );
    if (surfaced) continue;
    findings.push({
      finding_type: "missing_warning",
      severity: "medium",
      excerpt: warning,
      detail:
        "Warning printed on the SFP is not surfaced in the listing copy. Some marketplaces (notably Amazon, post-2026 TIC) require parity.",
      sfp_reference: warning,
      listing_line: null,
    });
  }

  return findings;
}

export function summarizeFindings(findings: DiffFinding[]): {
  count: number;
  severityMax: AuditSeverity | null;
} {
  if (findings.length === 0) return { count: 0, severityMax: null };
  let sev: AuditSeverity = "low";
  for (const f of findings) sev = maxSeverity(sev, f.severity);
  return { count: findings.length, severityMax: sev };
}
