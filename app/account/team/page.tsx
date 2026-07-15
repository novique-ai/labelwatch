import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Team — LabelWatch",
  robots: { index: false, follow: false },
};

// /account/team — Team org seat management. Bead infrastructure-cin7.
// Shows member list to all Team members; invite form to org owner only.

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import { CUSTOMER_COOKIE_NAME, decodeCustomerCookie } from "@/lib/customer-session";
import { getSupabase } from "@/lib/supabase";
import { isValidTier } from "@/lib/stripe";
import {
  getOrgForCustomer,
  listOrgMembers,
  listPendingInvitations,
} from "@/lib/organizations";
import { TEAM_MAX_SEATS } from "@/lib/tier-limits";
import InviteForm from "./invite-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function resolveCustomerId(): Promise<string | null> {
  const cookieStore = await cookies();
  return decodeCustomerCookie(cookieStore.get(CUSTOMER_COOKIE_NAME)?.value);
}

export default async function TeamPage() {
  const customerId = await resolveCustomerId();
  if (!customerId) redirect("/?account=signin");

  const supabase = getSupabase();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, email, firm_name, tier")
    .eq("id", customerId)
    .maybeSingle<{ id: string; email: string; firm_name: string; tier: string }>();
  if (!customer) redirect("/?account=not_found");

  const tier = isValidTier(customer.tier) ? customer.tier : "starter";
  if (tier !== "team") redirect("/account");

  const org = await getOrgForCustomer(supabase, customerId);
  if (!org) redirect("/account");

  const isOwner = org.owner_customer_id === customerId;
  const [members, pendingInvites] = await Promise.all([
    listOrgMembers(supabase, org.id),
    isOwner ? listPendingInvitations(supabase, org.id) : Promise.resolve([]),
  ]);

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
    row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--color-border-subtle)", fontSize: 13 },
    pill: { fontSize: 10, letterSpacing: 1, textTransform: "uppercase", background: "var(--color-bg-input)", border: "1px solid var(--color-border-subtle)", padding: "3px 8px", borderRadius: 10 },
    empty: { fontSize: 13, color: "var(--color-text-muted)", fontStyle: "italic", padding: "12px 0" },
    backLink: { fontSize: 12, color: "var(--color-text-muted)", textDecoration: "none" },
  };

  return (
    <main style={s.page}>
      <div style={s.topbar}>
        <Link href="/" style={s.brand}>
          label<span style={{ color: "var(--color-signal-red)" }}>.</span>watch
        </Link>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <Link href="/account" style={s.backLink}>← Dashboard</Link>
          <span>Team</span>
        </div>
      </div>

      <div style={s.container}>
        <h1 style={s.h1}>{org.name}</h1>
        <p style={s.sub}>Team · {members.length} of {TEAM_MAX_SEATS} seats</p>

        <section style={s.section}>
          <p style={s.sectionTitle}>Members</p>
          <div style={s.card}>
            {members.map((m, i) => (
              <div
                key={m.id}
                style={{
                  ...s.row,
                  borderBottom: i < members.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                }}
              >
                <div>
                  <div>{m.customer?.email ?? "(unknown)"}</div>
                  {m.customer?.firm_name && (
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                      {m.customer.firm_name}
                    </div>
                  )}
                </div>
                <span style={s.pill}>{m.role}</span>
              </div>
            ))}
            {members.length === 0 && (
              <p style={s.empty}>No members yet.</p>
            )}
          </div>
        </section>

        {isOwner && (
          <>
            {pendingInvites.length > 0 && (
              <section style={s.section}>
                <p style={s.sectionTitle}>Pending invitations</p>
                <div style={s.card}>
                  {pendingInvites.map((inv, i) => (
                    <div
                      key={inv.id}
                      style={{
                        ...s.row,
                        borderBottom: i < pendingInvites.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                      }}
                    >
                      <span>{inv.email}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                        expires {new Date(inv.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {members.length < TEAM_MAX_SEATS && (
              <section style={s.section}>
                <p style={s.sectionTitle}>Invite a team member</p>
                <div style={s.card}>
                  <InviteForm />
                </div>
              </section>
            )}

            {members.length >= TEAM_MAX_SEATS && (
              <section style={s.section}>
                <p style={{ ...s.empty, fontStyle: "normal" }}>
                  Your team is full ({TEAM_MAX_SEATS} of {TEAM_MAX_SEATS} seats used).
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
