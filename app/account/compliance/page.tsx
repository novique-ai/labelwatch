import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// /account/compliance — Amazon TIC compliance checklist + AI SKU assessment.
// Bead infrastructure-2e17.
//
// All tiers: static TIC checklist for the customer's categories.
// Pro+: AI-powered assessment of listing text against the ruleset.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CUSTOMER_COOKIE_NAME, decodeCustomerCookie } from "@/lib/customer-session";
import { getSupabase } from "@/lib/supabase";
import {
  getRulesForCategories,
  CATEGORY_DISPLAY_NAMES,
  RULESET_LAST_REVIEWED,
  AMAZON_TIC_POLICY_URL,
} from "@/lib/amazon-tic-rules";
import type { IngredientCategory } from "@/types/database.types";
import type { CSSProperties } from "react";
import TicAssessor from "./tic-assessor";

export const runtime = "nodejs";
export const revalidate = 0;

const s = {
  page: {
    minHeight: "100vh",
    background: "var(--color-bg-base)",
    color: "var(--color-text-primary)",
    fontFamily: "system-ui, sans-serif",
    padding: "40px",
  } as CSSProperties,
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 40,
  } as CSSProperties,
  brand: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontSize: 22,
    fontStyle: "italic",
    color: "var(--color-text-primary)",
    textDecoration: "none",
  } as CSSProperties,
  backLink: {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    color: "var(--color-text-muted)",
    textDecoration: "none",
  } as CSSProperties,
  h1: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontSize: 36,
    fontWeight: 400,
    margin: "0 0 8px",
    color: "var(--color-text-primary)",
  } as CSSProperties,
  sub: {
    fontSize: 13,
    color: "var(--color-text-muted)",
    marginBottom: 36,
  } as CSSProperties,
  sectionRule: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    margin: "40px 0 20px",
  } as CSSProperties,
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: "var(--color-text-muted)",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  ruleLine: {
    flex: 1,
    height: 1,
    background: "var(--color-border-subtle)",
  } as CSSProperties,
  categoryGroup: {
    marginBottom: 32,
  } as CSSProperties,
  categoryHeading: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    color: "var(--color-signal-red)",
    marginBottom: 12,
  } as CSSProperties,
  ruleCard: (severity: string): CSSProperties => ({
    border: `1px solid ${severity === "critical" ? "rgba(198,58,31,0.3)" : "var(--color-border-subtle)"}`,
    borderRadius: 4,
    padding: "14px 16px",
    marginBottom: 8,
    background: "var(--color-bg-card)",
  }),
  ruleHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 4,
  } as CSSProperties,
  ruleId: {
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    color: "var(--color-text-muted)",
    flexShrink: 0,
    paddingTop: 2,
  } as CSSProperties,
  ruleTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--color-text-primary)",
  } as CSSProperties,
  ruleReq: {
    fontSize: 12,
    color: "var(--color-text-secondary)",
    lineHeight: 1.5,
    marginTop: 4,
  } as CSSProperties,
  ruleRef: {
    fontSize: 10,
    color: "var(--color-text-muted)",
    marginTop: 6,
    fontFamily: "var(--font-jetbrains), monospace",
  } as CSSProperties,
  severityBadge: (severity: string): CSSProperties => ({
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
    padding: "2px 6px",
    borderRadius: 2,
    fontFamily: "var(--font-jetbrains), monospace",
    flexShrink: 0,
    background:
      severity === "critical"
        ? "rgba(198,58,31,0.15)"
        : severity === "major"
          ? "rgba(180,120,0,0.15)"
          : "rgba(100,100,100,0.15)",
    color:
      severity === "critical"
        ? "#c63a1f"
        : severity === "major"
          ? "#b47800"
          : "var(--color-text-muted)",
  }),
  noCategoriesBanner: {
    padding: "24px",
    border: "1px dashed var(--color-border-subtle)",
    borderRadius: 4,
    color: "var(--color-text-muted)",
    fontSize: 13,
    lineHeight: 1.6,
  } as CSSProperties,
};

function SectionRule({ label }: { label: string }) {
  return (
    <div style={s.sectionRule}>
      <span style={s.sectionLabel}>{label}</span>
      <div style={s.ruleLine} />
    </div>
  );
}

export default async function CompliancePage() {
  const cookieStore = await cookies();
  const customerId = decodeCustomerCookie(cookieStore.get(CUSTOMER_COOKIE_NAME)?.value);
  if (!customerId) redirect("/");

  const supabase = getSupabase();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, tier, email, firm_name")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) redirect("/");

  const { data: profile } = await supabase
    .from("customer_profiles")
    .select("ingredient_categories")
    .eq("customer_id", customerId)
    .maybeSingle();

  const categories = ((profile?.ingredient_categories ?? []) as IngredientCategory[]).filter(
    (c): c is IngredientCategory => !!c,
  );

  const isPro = customer.tier === "pro" || customer.tier === "team";

  // Group rules by source (general + per-category).
  const generalRules = getRulesForCategories([]).filter((r) => r.id.startsWith("GEN-"));
  const categoryRuleGroups: Array<{ cat: IngredientCategory; rules: ReturnType<typeof getRulesForCategories> }> = [];
  for (const cat of categories) {
    const catRules = getRulesForCategories([cat]).filter((r) => !r.id.startsWith("GEN-"));
    if (catRules.length > 0) categoryRuleGroups.push({ cat, rules: catRules });
  }

  const totalRules =
    generalRules.length + categoryRuleGroups.reduce((s, g) => s + g.rules.length, 0);
  const criticalCount = [
    ...generalRules,
    ...categoryRuleGroups.flatMap((g) => g.rules),
  ].filter((r) => r.severity === "critical").length;

  return (
    <div style={s.page}>
      <header style={s.topbar}>
        <a href="/" style={s.brand}>LabelWatch</a>
        <a href="/account" style={s.backLink}>← Back to account</a>
      </header>

      <h1 style={s.h1}>Amazon TIC Compliance</h1>
      <p style={s.sub}>
        {categories.length > 0
          ? `${totalRules} rules across ${categories.length + 1} category groups · ${criticalCount} critical · Last reviewed ${RULESET_LAST_REVIEWED}`
          : "Configure your product categories in account settings to see applicable rules."}
        {" · "}
        <a
          href={AMAZON_TIC_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          Amazon policy ↗
        </a>
        {" · "}
        <a href="/references" style={{ color: "inherit", textDecoration: "underline" }}>
          All references
        </a>
      </p>

      {isPro && (
        <TicAssessor categories={categories} />
      )}

      {!isPro && (
        <div
          style={{
            ...s.noCategoriesBanner,
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-subtle)",
            marginBottom: 32,
          }}
        >
          <strong style={{ color: "var(--color-text-primary)" }}>AI SKU Assessment</strong>
          <br />
          Upgrade to Pro to paste a listing and get an AI-powered per-rule compliance verdict.
          The checklist below is available to all plans.
        </div>
      )}

      {categories.length === 0 ? (
        <div style={s.noCategoriesBanner}>
          No product categories configured yet.{" "}
          <a href="/account" style={{ color: "var(--color-signal-red)" }}>
            Add categories in Account Settings →
          </a>
        </div>
      ) : (
        <>
          <SectionRule label="General — all supplement categories" />
          <div style={s.categoryGroup}>
            {generalRules.map((rule) => (
              <div key={rule.id} style={s.ruleCard(rule.severity)}>
                <div style={s.ruleHeader}>
                  <span style={s.ruleId}>{rule.id}</span>
                  <span style={s.ruleTitle}>{rule.title}</span>
                  <span style={{ flex: 1 }} />
                  <span style={s.severityBadge(rule.severity)}>{rule.severity}</span>
                </div>
                <p style={s.ruleReq}>{rule.requirement}</p>
                <p style={s.ruleRef}>{rule.reference}</p>
              </div>
            ))}
          </div>

          {categoryRuleGroups.map(({ cat, rules }) => (
            <div key={cat}>
              <SectionRule label={CATEGORY_DISPLAY_NAMES[cat]} />
              <div style={s.categoryGroup}>
                {rules.map((rule) => (
                  <div key={rule.id} style={s.ruleCard(rule.severity)}>
                    <div style={s.ruleHeader}>
                      <span style={s.ruleId}>{rule.id}</span>
                      <span style={s.ruleTitle}>{rule.title}</span>
                      <span style={{ flex: 1 }} />
                      <span style={s.severityBadge(rule.severity)}>{rule.severity}</span>
                    </div>
                    <p style={s.ruleReq}>{rule.requirement}</p>
                    <p style={s.ruleRef}>{rule.reference}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
