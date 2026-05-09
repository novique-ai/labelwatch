// Claude-powered TIC compliance assessment against the static Amazon ruleset.
// Bead infrastructure-2e17.
//
// Takes listing text + applicable rules → structured per-rule verdict.
// Stateless: no DB writes. Caller is responsible for surfacing results.
//
// Model: claude-sonnet-4-6 (accuracy over speed; rules are nuanced).
// Output forced via tool_use for reliable JSON.

import Anthropic from "@anthropic-ai/sdk";
import type { TicRule, TicRuleResult, RuleStatus } from "./amazon-tic-rules";
export type { TicRuleResult } from "./amazon-tic-rules";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

const ASSESSMENT_TOOL: Anthropic.Tool = {
  name: "record_tic_assessment",
  description:
    "Record the TIC compliance assessment results for each applicable rule, based on the provided listing text.",
  input_schema: {
    type: "object" as const,
    required: ["results", "overall_risk", "summary"],
    properties: {
      results: {
        type: "array",
        description: "Assessment result for each rule.",
        items: {
          type: "object",
          required: ["rule_id", "status", "evidence", "recommendation"],
          properties: {
            rule_id: {
              type: "string",
              description: "The rule id (e.g. GEN-001, PRO-002).",
            },
            status: {
              type: "string",
              enum: ["pass", "fail", "warn", "unknown"],
              description:
                "pass = listing clearly satisfies the rule; fail = listing clearly violates it; warn = potential issue, needs verification; unknown = insufficient information in listing to assess.",
            },
            evidence: {
              type: "string",
              description:
                "Specific text from the listing that supports this verdict, or explanation of what is absent.",
            },
            recommendation: {
              type: "string",
              description:
                "Concrete action the seller should take. Empty string if status is pass.",
            },
          },
        },
      },
      overall_risk: {
        type: "string",
        enum: ["low", "medium", "high", "critical"],
        description:
          "Overall compliance risk. critical = at least one critical-severity fail; high = major fail or multiple warns; medium = minor fails or warns; low = all pass or only minor unknowns.",
      },
      summary: {
        type: "string",
        description:
          "2-3 sentence plain-English summary of the key compliance gaps and the most urgent action the seller should take.",
      },
    },
  },
};

export interface TicAssessmentResult {
  results: TicRuleResult[];
  overall_risk: "low" | "medium" | "high" | "critical";
  summary: string;
  assessed_at: string;
  rule_count: number;
  fail_count: number;
  warn_count: number;
  pass_count: number;
  unknown_count: number;
}

function buildSystemPrompt(rules: TicRule[]): string {
  const ruleBlock = rules
    .map(
      (r) =>
        `[${r.id}] (${r.severity}) ${r.title}\n` +
        `Requirement: ${r.requirement}\n` +
        `Reference: ${r.reference}`,
    )
    .join("\n\n");

  return `You are an expert Amazon supplement compliance analyst specializing in Amazon's 2026 TIC (Third-party Ingredient Compliance) requirements and FDA dietary supplement regulations.

You will be given a product listing (title, bullet points, description, and/or other copy) for a dietary supplement sold on Amazon. Your task is to assess the listing against the applicable compliance rules provided below.

Assessment guidance:
- Base your verdict ONLY on information present or absent in the listing text. Do not assume the seller has documentation not mentioned in the listing.
- "pass" = the listing clearly demonstrates compliance (e.g., mentions "NSF Certified for Sport," "third-party tested," specific mg of caffeine).
- "fail" = the listing clearly contains prohibited content or makes a prohibited claim (e.g., "cures diabetes," contains DMAA).
- "warn" = the listing raises a concern but you cannot confirm a violation from the text alone (e.g., "clinically proven" without citing a study).
- "unknown" = the listing provides no information relevant to this rule — neither positive nor negative evidence. This is appropriate for documentation requirements (CoA, certification) where absence in the listing is expected.
- Be conservative: prefer "warn" over "fail" when the evidence is ambiguous.
- For evidence: quote the exact listing text that drove your verdict, or state what is missing.
- For recommendation: be concrete and actionable. For "pass," you may leave it empty.

APPLICABLE COMPLIANCE RULES:
${ruleBlock}`;
}

export async function assessListing(
  listingText: string,
  rules: TicRule[],
): Promise<TicAssessmentResult> {
  if (rules.length === 0) throw new Error("no rules provided");
  if (!listingText.trim()) throw new Error("listing text is empty");

  const client = getClient();
  const systemPrompt = buildSystemPrompt(rules);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    tools: [ASSESSMENT_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: `Please assess the following Amazon supplement listing for TIC compliance:\n\n${listingText.slice(0, 40_000)}`,
      },
    ],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("Claude did not return a tool_use block");

  const raw = toolUse.input as {
    results: Array<{
      rule_id: string;
      status: string;
      evidence: string;
      recommendation: string;
    }>;
    overall_risk: string;
    summary: string;
  };

  // Merge Claude's verdicts back with the full rule objects.
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  const results: TicRuleResult[] = raw.results
    .map((r) => {
      const rule = ruleMap.get(r.rule_id);
      if (!rule) return null;
      return {
        ...rule,
        status: (["pass", "fail", "warn", "unknown"].includes(r.status)
          ? r.status
          : "unknown") as RuleStatus,
        evidence: r.evidence ?? "",
        recommendation: r.recommendation ?? "",
      };
    })
    .filter((r): r is TicRuleResult => r !== null);

  // Fill in any rules Claude skipped as unknown.
  const assessed = new Set(results.map((r) => r.id));
  for (const rule of rules) {
    if (!assessed.has(rule.id)) {
      results.push({ ...rule, status: "unknown", evidence: "", recommendation: "" });
    }
  }

  const fail_count = results.filter((r) => r.status === "fail").length;
  const warn_count = results.filter((r) => r.status === "warn").length;
  const pass_count = results.filter((r) => r.status === "pass").length;
  const unknown_count = results.filter((r) => r.status === "unknown").length;

  return {
    results,
    overall_risk: (["low", "medium", "high", "critical"].includes(raw.overall_risk)
      ? raw.overall_risk
      : "medium") as TicAssessmentResult["overall_risk"],
    summary: raw.summary ?? "",
    assessed_at: new Date().toISOString(),
    rule_count: results.length,
    fail_count,
    warn_count,
    pass_count,
    unknown_count,
  };
}
