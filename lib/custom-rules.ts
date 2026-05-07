// Custom alert rule evaluation engine — bead infrastructure-yo7k.
// Pure functions only. No I/O. Team tier only.
//
// Custom rules supplement the standard matcher: a recall passes a rule when
// any keyword in rule.keywords appears (case-insensitive, substring match) in
// the recall's product_description or reason_for_recall text. Rules do NOT
// apply the standard severity gate — they're intentionally unrestricted.
//
// Integration point: runMatcher() calls matchCustomRuleCandidates() after
// matchCandidates(); any custom-rule hits are accumulated into allCandidates
// alongside standard matches. The UNIQUE (recall_id, customer_channel_id)
// constraint on delivery_jobs de-duplicates if a (recall, channel) pair
// was already claimed by the standard algorithm — the first insert wins.

import type { AlertRuleRow, RecallRow } from "@/types/database.types";
import type { CustomerMatchContext, MatchCandidate } from "./match-rules";

// Returns the names of rules whose keywords match this recall's text fields.
export function evaluateCustomRules(
  recall: Pick<RecallRow, "product_description" | "reason_for_recall">,
  rules: AlertRuleRow[],
): string[] {
  if (!rules.length) return [];
  const haystack = [
    recall.product_description ?? "",
    recall.reason_for_recall ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (!haystack.trim()) return [];

  const matched: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled || !rule.keywords.length) continue;
    if (rule.keywords.some((kw) => kw.trim() && haystack.includes(kw.toLowerCase().trim()))) {
      matched.push(rule.name);
    }
  }
  return matched;
}

// Pure: emit one MatchCandidate per channel for each Team customer whose
// org has a custom rule that matches this recall. Mirrors matchCandidates()
// shape. matchedValue = first matching rule name.
export function matchCustomRuleCandidates(args: {
  recall: Pick<
    RecallRow,
    "id" | "classification" | "product_description" | "reason_for_recall"
  >;
  customers: CustomerMatchContext[];
}): MatchCandidate[] {
  const { recall, customers } = args;
  if (!recall.classification) return []; // unclassified recalls never emit

  const out: MatchCandidate[] = [];
  for (const { tier, profile, channels, alertRules } of customers) {
    if (tier !== "team" || !alertRules?.length || channels.length === 0) continue;

    const matchedNames = evaluateCustomRules(recall, alertRules);
    if (!matchedNames.length) continue;

    for (const channel of channels) {
      out.push({
        recallId: recall.id,
        customerId: profile.customer_id,
        customerChannelId: channel.id,
        matchReason: "custom_rule",
        matchedValue: matchedNames[0], // first matching rule is the canonical label
        severityClass: recall.classification,
        tier,
      });
    }
  }
  return out;
}
