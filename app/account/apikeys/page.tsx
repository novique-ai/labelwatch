// /account/apikeys — API key management. Team org owners only.
// Bead infrastructure-2mkx.

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import { CUSTOMER_COOKIE_NAME, decodeCustomerCookie } from "@/lib/customer-session";
import { getSupabase } from "@/lib/supabase";
import { isValidTier } from "@/lib/stripe";
import { getOrgForCustomer } from "@/lib/organizations";
import { TEAM_MAX_API_KEYS } from "@/lib/tier-limits";
import type { ApiKeyRow } from "@/types/database.types";
import ApiKeysManager from "./apikeys-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function resolveCustomerId(): Promise<string | null> {
  const cookieStore = await cookies();
  return decodeCustomerCookie(cookieStore.get(CUSTOMER_COOKIE_NAME)?.value);
}

export default async function ApiKeysPage() {
  const customerId = await resolveCustomerId();
  if (!customerId) redirect("/?account=signin");

  const supabase = getSupabase();

  const { data: customer } = await supabase
    .from("customers").select("id, tier")
    .eq("id", customerId)
    .maybeSingle<{ id: string; tier: string }>();
  if (!customer) redirect("/?account=not_found");

  const tier = isValidTier(customer.tier) ? customer.tier : "starter";
  if (tier !== "team") redirect("/account");

  const org = await getOrgForCustomer(supabase, customerId);
  if (!org || org.owner_customer_id !== customerId) redirect("/account"); // owner only

  type KeyDisplay = Pick<ApiKeyRow, "id" | "name" | "created_at" | "last_used_at">;
  const { data: keysRaw } = await supabase
    .from("api_keys")
    .select("id, name, created_at, last_used_at")
    .eq("organization_id", org.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });
  const keys: KeyDisplay[] = (keysRaw ?? []) as KeyDisplay[];

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://label.watch";

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
    codeBlock: { background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: 4, padding: "14px 18px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, overflowX: "auto" as const, color: "var(--color-text-secondary)", margin: "0 0 8px" },
    note: { fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 16px" },
  };

  return (
    <main style={s.page}>
      <div style={s.topbar}>
        <Link href="/" style={s.brand}>
          label<span style={{ color: "var(--color-signal-red)" }}>.</span>watch
        </Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link href="/account" style={s.backLink}>← Dashboard</Link>
          <span>API Keys</span>
        </div>
      </div>

      <div style={s.container}>
        <h1 style={s.h1}>API access.</h1>
        <p style={s.sub}>{org.name} · Team</p>

        <section style={s.section}>
          <p style={s.sectionTitle}>Keys ({keys.length} of {TEAM_MAX_API_KEYS})</p>
          <div style={s.card}>
            <ApiKeysManager initialKeys={keys} maxKeys={TEAM_MAX_API_KEYS} />
          </div>
        </section>

        <section style={s.section}>
          <p style={s.sectionTitle}>API reference</p>
          <div style={s.card}>
            <p style={s.note}>Use your API key as a Bearer token. All endpoints return JSON.</p>

            <p style={{ ...s.note, fontWeight: 600, margin: "0 0 6px" }}>GET /api/v1/matches</p>
            <p style={s.note}>Your org&apos;s full match history. Supports <code>?from</code>, <code>?to</code>, <code>?severity</code>, <code>?limit</code>, <code>?offset</code>.</p>
            <pre style={s.codeBlock}>{`curl "${origin}/api/v1/matches?limit=50" \\
  -H "Authorization: Bearer lw_<your_key>"`}</pre>

            <p style={{ ...s.note, fontWeight: 600, margin: "12px 0 6px" }}>GET /api/account/export.csv</p>
            <p style={s.note}>Same match history as a CSV file. Supports <code>?from</code> and <code>?to</code>.</p>
            <pre style={s.codeBlock}>{`curl "${origin}/api/account/export.csv" \\
  -H "Authorization: Bearer lw_<your_key>" \\
  -o matches.csv`}</pre>

            <p style={{ ...s.note, margin: "12px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
              severity values: <code>I</code>, <code>II</code>, <code>III</code> (comma-separated, e.g. <code>?severity=I,II</code>)
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
