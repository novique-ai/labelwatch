"use client";

// AI SKU assessment panel — Pro+ only.
// Bead infrastructure-2e17.

import { useState } from "react";
import type { CSSProperties } from "react";
import type { IngredientCategory } from "@/types/database.types";
import type { TicAssessmentResult, TicRuleResult } from "@/lib/tic-assessment";
import {
  AMAZON_TIC_POLICY_REFERENCE,
  AMAZON_TIC_POLICY_URL,
  CATEGORY_DISPLAY_NAMES,
  RULESET_LAST_REVIEWED,
} from "@/lib/amazon-tic-rules";

type Props = {
  categories: IngredientCategory[];
};

const s = {
  panel: {
    border: "1px solid var(--color-border-subtle)",
    borderRadius: 4,
    padding: "24px",
    marginBottom: 40,
    background: "var(--color-bg-card)",
  } as CSSProperties,
  heading: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: "var(--color-signal-red)",
    marginBottom: 12,
  } as CSSProperties,
  textarea: {
    width: "100%",
    minHeight: 180,
    background: "var(--color-bg-input)",
    border: "1px solid var(--color-border-subtle)",
    color: "var(--color-text-primary)",
    padding: "12px",
    borderRadius: 3,
    fontSize: 13,
    fontFamily: "inherit",
    lineHeight: 1.5,
    resize: "vertical" as const,
    marginBottom: 12,
    boxSizing: "border-box" as const,
  } as CSSProperties,
  hint: {
    fontSize: 11,
    color: "var(--color-text-muted)",
    marginBottom: 12,
    lineHeight: 1.5,
  } as CSSProperties,
  btn: {
    background: "var(--color-signal-red)",
    color: "#fff",
    border: "none",
    padding: "10px 20px",
    borderRadius: 3,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 500,
  } as CSSProperties,
  btnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed" as const,
  } as CSSProperties,
  error: {
    color: "var(--color-signal-red)",
    fontSize: 12,
    marginTop: 8,
  } as CSSProperties,
  riskBadge: (risk: string): CSSProperties => ({
    display: "inline-block",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    padding: "3px 8px",
    borderRadius: 2,
    fontFamily: "var(--font-jetbrains), monospace",
    marginLeft: 10,
    background:
      risk === "critical"
        ? "rgba(198,58,31,0.2)"
        : risk === "high"
          ? "rgba(180,80,0,0.2)"
          : risk === "medium"
            ? "rgba(180,140,0,0.2)"
            : "rgba(0,140,0,0.15)",
    color:
      risk === "critical"
        ? "#c63a1f"
        : risk === "high"
          ? "#b45000"
          : risk === "medium"
            ? "#8a7000"
            : "#007a00",
  }),
  resultHeader: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
    paddingTop: 20,
    borderTop: "1px solid var(--color-border-subtle)",
    marginTop: 20,
  } as CSSProperties,
  statsRow: {
    display: "flex",
    gap: 20,
    marginBottom: 16,
    flexWrap: "wrap" as const,
  } as CSSProperties,
  stat: (color: string): CSSProperties => ({
    fontSize: 11,
    color,
    fontFamily: "var(--font-jetbrains), monospace",
    letterSpacing: 0.5,
  }),
  summary: {
    fontSize: 13,
    color: "var(--color-text-secondary)",
    lineHeight: 1.6,
    marginBottom: 20,
    padding: "12px 16px",
    background: "var(--color-bg-base)",
    borderRadius: 3,
    borderLeft: "3px solid var(--color-signal-red)",
  } as CSSProperties,
  ruleRef: {
    fontSize: 10,
    color: "var(--color-text-muted)",
    margin: "6px 0 0",
    paddingLeft: 22,
    fontFamily: "var(--font-jetbrains), monospace",
    lineHeight: 1.5,
    overflowWrap: "anywhere" as const,
  } as CSSProperties,
  resultCard: (status: string): CSSProperties => ({
    border: `1px solid ${
      status === "fail"
        ? "rgba(198,58,31,0.4)"
        : status === "warn"
          ? "rgba(180,140,0,0.3)"
          : status === "pass"
            ? "rgba(0,140,0,0.25)"
            : "var(--color-border-subtle)"
    }`,
    borderRadius: 4,
    padding: "12px 14px",
    marginBottom: 8,
    background: "var(--color-bg-base)",
  }),
  resultTitle: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  } as CSSProperties,
  statusIcon: (status: string) =>
    status === "pass" ? "✓" : status === "fail" ? "✗" : status === "warn" ? "⚠" : "?",
  statusColor: (status: string) =>
    status === "pass"
      ? "#007a00"
      : status === "fail"
        ? "#c63a1f"
        : status === "warn"
          ? "#8a7000"
          : "var(--color-text-muted)",
};

const STATUS_LABELS: Record<string, string> = {
  pass: "Pass",
  fail: "Fail",
  warn: "Warn",
  unknown: "Unknown",
};

export default function TicAssessor({ categories }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TicAssessmentResult | null>(null);

  const categoryNames = categories.map((c) => CATEGORY_DISPLAY_NAMES[c]).join(", ");

  async function run() {
    if (!text.trim()) {
      setError("Paste your Amazon listing text above.");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/audit/tic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listing_text: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Assessment failed.");
        return;
      }
      setResult(data as TicAssessmentResult);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  const failRules = result?.results.filter((r) => r.status === "fail") ?? [];
  const warnRules = result?.results.filter((r) => r.status === "warn") ?? [];
  const passRules = result?.results.filter((r) => r.status === "pass") ?? [];
  const unknownRules = result?.results.filter((r) => r.status === "unknown") ?? [];

  return (
    <div style={s.panel}>
      <p style={s.heading}>AI SKU Assessment · Pro</p>

      <p style={s.hint}>
        Paste your Amazon listing title, bullet points, and description below.
        {categories.length > 0
          ? ` Assessed against rules for: ${categoryNames}.`
          : " Configure your product categories in account settings for category-specific rules."}
        <br />
        Compliance ruleset last reviewed {RULESET_LAST_REVIEWED};{" "}
        <a
          href={AMAZON_TIC_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          Amazon policy
        </a>
        . {AMAZON_TIC_POLICY_REFERENCE}
      </p>

      <textarea
        style={s.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Product Title&#10;&#10;• Bullet point 1&#10;• Bullet point 2&#10;&#10;Product description..."
        disabled={loading}
      />

      <button
        type="button"
        onClick={run}
        disabled={loading || !text.trim()}
        style={{
          ...s.btn,
          ...((loading || !text.trim()) ? s.btnDisabled : {}),
        }}
      >
        {loading ? "Assessing…" : "Check compliance →"}
      </button>

      {error && <p style={s.error}>{error}</p>}

      {result && (
        <div>
          <div style={s.resultHeader}>
            <span
              style={{
                fontFamily: "var(--font-instrument-serif), serif",
                fontSize: 18,
                color: "var(--color-text-primary)",
              }}
            >
              Assessment complete
            </span>
            <span style={s.riskBadge(result.overall_risk)}>
              {result.overall_risk} risk
            </span>
          </div>

          <div style={s.statsRow}>
            <span style={s.stat("#c63a1f")}>{result.fail_count} fail</span>
            <span style={s.stat("#8a7000")}>{result.warn_count} warn</span>
            <span style={s.stat("#007a00")}>{result.pass_count} pass</span>
            <span style={s.stat("var(--color-text-muted)")}>{result.unknown_count} unknown</span>
          </div>

          <div style={s.summary}>{result.summary}</div>

          {failRules.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: "#c63a1f",
                  marginBottom: 8,
                }}
              >
                Failures — fix before listing
              </p>
              {failRules.map((r) => (
                <ResultCard key={r.id} rule={r} />
              ))}
            </>
          )}

          {warnRules.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: "#8a7000",
                  marginBottom: 8,
                  marginTop: 20,
                }}
              >
                Warnings — verify before launch
              </p>
              {warnRules.map((r) => (
                <ResultCard key={r.id} rule={r} />
              ))}
            </>
          )}

          {passRules.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: "#007a00",
                  marginBottom: 8,
                  marginTop: 20,
                }}
              >
                Passing
              </p>
              {passRules.map((r) => (
                <ResultCard key={r.id} rule={r} />
              ))}
            </>
          )}

          {unknownRules.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: "var(--color-text-muted)",
                  marginBottom: 8,
                  marginTop: 20,
                }}
              >
                Unknown — insufficient listing data
              </p>
              {unknownRules.map((r) => (
                <ResultCard key={r.id} rule={r} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ResultCard({ rule }: { rule: TicRuleResult }) {
  return (
    <div style={s.resultCard(rule.status)}>
      <div style={s.resultTitle}>
        <span
          style={{
            color: s.statusColor(rule.status),
            fontWeight: 600,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {s.statusIcon(rule.status)}
        </span>
        <span
          style={{
            fontSize: 12,
            fontFamily: "var(--font-jetbrains), monospace",
            color: "var(--color-text-muted)",
            flexShrink: 0,
            paddingTop: 1,
          }}
        >
          {rule.id}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
          {rule.title}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 9,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: s.statusColor(rule.status),
            fontFamily: "var(--font-jetbrains), monospace",
            flexShrink: 0,
          }}
        >
          {STATUS_LABELS[rule.status]}
        </span>
      </div>
      {rule.evidence && (
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "4px 0", paddingLeft: 22 }}>
          {rule.evidence}
        </p>
      )}
      {rule.recommendation && (
        <p
          style={{
            fontSize: 12,
            color: "var(--color-text-muted)",
            margin: "4px 0 0",
            paddingLeft: 22,
            fontStyle: "italic",
          }}
        >
          → {rule.recommendation}
        </p>
      )}
      <p style={s.ruleRef}>{rule.reference}</p>
    </div>
  );
}
