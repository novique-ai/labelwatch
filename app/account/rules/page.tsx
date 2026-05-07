// /account/rules — custom alert rule management. Team only. Bead infrastructure-yo7k.

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import { CUSTOMER_COOKIE_NAME, decodeCustomerCookie } from "@/lib/customer-session";
import { getSupabase } from "@/lib/supabase";
import { isValidTier } from "@/lib/stripe";
import { getOrgForCustomer } from "@/lib/organizations";
import type { AlertRuleRow } from "@/types/database.types";
import RulesManager from "./rules-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RULES = 20;

async function resolveCustomerId(): Promise<string | null> {
  const cookieStore = await cookies();
  return decodeCustomerCookie(cookieStore.get(CUSTOMER_COOKIE_NAME)?.value);
}

export default async function RulesPage() {
  const customerId = await resolveCustomerId();
  if (!customerId) redirect("/?account=signin");

  const supabase = getSupabase();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, firm_name, tier")
    .eq("id", customerId)
    .maybeSingle<{ id: string; firm_name: string; tier: string }>();
  if (!customer) redirect("/?account=not_found");

  const tier = isValidTier(customer.tier) ? customer.tier : "starter";
  if (tier !== "team") redirect("/account");

  const org = await getOrgForCustomer(supabase, customerId);
  if (!org) redirect("/account");

  const isOwner = org.owner_customer_id === customerId;
  if (!isOwner) redirect("/account"); // read-only members can't manage rules

  const { data: rulesRaw } = await supabase
    .from("alert_rules")
    .select("id, organization_id, name, keywords, enabled, created_at")
    .eq("organization_id", org.id)
    .eq("enabled", true)
    .order("created_at", { ascending: true });
  const rules: AlertRuleRow[] = (rulesRaw ?? []) as AlertRuleRow[];

  const s: Record<string, CSSProperties> = {
    page: { minHeight: "100vh", background: "var(--color-bg-base)", color: "var(--color-text-primary)", fontFamily: "var(--font-jetbrains), monospace" },
    topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 40px", fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", borderBottom: "1px solid var(--color-border-subtle)" },
    brand: { fontFamily: "var(--font-instrument-serif), serif", fontSize: 22, letterSpacing: -0.5, textTransform: "none", color: "var(--color-text-primary)", textDecoration: "none" },
    container: { maxWidth: 960, margin: "0 auto", padding: "60px 40px" },
    h1: { fontFamily: "var(--font-instrument-serif), serif", fontSize: 48, lineHeight: 1.05, letterSpacing: -1, margin: "0 0 12px", fontWeight: 400 },
    sub: { fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 48px" },
    section: { margin: "0 0 32px" },
    sectionTitle: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--color-text-muted)", margin: "0 0 12px" },
    card: { background: "var(--color-bg-card)", border: "1px solid var(--color-border-subtle)", padding: "20px 24px", borderRadius: 4 },
    backLink: { fontSize: 12, color: "var(--color-text-muted)", textDecoration: "none" },
    note: { fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 24px", lineHeight: 1.6 },
  };

  return (
    <main style={s.page}>
      <div style={s.topbar}>
        <Link href="/" style={s.brand}>
          label<span style={{ color: "var(--color-signal-red)" }}>.</span>watch
        </Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link href="/account" style={s.backLink}>← Dashboard</Link>
          <span>Alert Rules</span>
        </div>
      </div>

      <div style={s.container}>
        <h1 style={s.h1}>Alert rules.</h1>
        <p style={s.sub}>{org.name} · Team</p>

        <p style={s.note}>
          Custom rules run after the standard matcher. Any recall whose product description
          or reason for recall contains one of your keywords triggers a delivery to all your
          configured channels — regardless of ingredient categories or severity settings.
        </p>

        <section style={s.section}>
          <p style={s.sectionTitle}>Rules ({rules.length} of {MAX_RULES})</p>
          <div style={s.card}>
            <RulesManager initialRules={rules} maxRules={MAX_RULES} />
          </div>
        </section>
      </div>
    </main>
  );
}
