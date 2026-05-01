// /account — customer dashboard. Bead infrastructure-5ncn.
//
// Identity resolution priority:
//   1. lw_customer cookie (HMAC-signed, set by /api/onboard, 90-day max-age)
//   2. ?session_id=cs_... query param (first post-Stripe entry, before
//      the API has had a chance to set the cookie — but onboard-form.tsx
//      always lets the cookie set before redirecting, so this path is
//      mostly a defensive fallback)
//   3. neither → redirect to /?account=signin (a "use the link in your
//      Stripe receipt" message)
//
// Read-only for MVP1. Editing scope/channels is post-launch.

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import { CUSTOMER_COOKIE_NAME, decodeCustomerCookie } from "@/lib/customer-session";
import { signAuditToken } from "@/lib/audit-token";
import { getStripe } from "@/lib/stripe";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Promise<{
  session_id?: string;
  signing_secret?: string;
}>;

type CustomerRow = {
  id: string;
  email: string;
  firm_name: string;
  tier: string;
  stripe_customer_id: string;
  onboarding_completed_at: string | null;
};

type ProfileRow = {
  ingredient_categories: string[];
  firm_aliases: string[];
  severity_preferences: { default_min_class?: string };
};

type ChannelRow = {
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
};

type RecentMatchRow = {
  id: string;
  status: string;
  severity_class: string;
  matched_value: string;
  sent_at: string | null;
  created_at: string;
  recall: {
    recall_number: string;
    firm_name_raw: string;
    product_description: string | null;
  } | null;
};

async function resolveCustomerId(searchParams: { session_id?: string }): Promise<string | null> {
  // 1. Cookie
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(CUSTOMER_COOKIE_NAME)?.value;
  const fromCookie = decodeCustomerCookie(cookieValue);
  if (fromCookie) return fromCookie;

  // 2. session_id fallback — re-derive customer_id from Stripe session → DB
  const sessionId = searchParams.session_id;
  if (sessionId && sessionId.startsWith("cs_")) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const stripeCustomerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;
      if (stripeCustomerId) {
        const supabase = getSupabase();
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();
        if (data?.id) return data.id;
      }
    } catch (err) {
      console.error("/account: session-id fallback failed:", err);
    }
  }

  return null;
}

async function loadDashboardData(customerId: string) {
  const supabase = getSupabase();
  const stripe = getStripe();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, email, firm_name, tier, stripe_customer_id, onboarding_completed_at")
    .eq("id", customerId)
    .maybeSingle<CustomerRow>();
  if (!customer) return null;

  const { data: profileRaw } = await supabase
    .from("customer_profiles")
    .select("ingredient_categories, firm_aliases, severity_preferences")
    .eq("customer_id", customerId)
    .maybeSingle<ProfileRow>();
  const profile: ProfileRow = profileRaw ?? {
    ingredient_categories: [],
    firm_aliases: [],
    severity_preferences: {},
  };

  const { data: channelsRaw } = await supabase
    .from("customer_channels")
    .select("type, config, enabled")
    .eq("customer_id", customerId);
  const channels: ChannelRow[] = (channelsRaw ?? []) as ChannelRow[];

  const { data: matchesRaw } = await supabase
    .from("delivery_jobs")
    .select(
      "id, status, severity_class, matched_value, sent_at, created_at, recall:recalls(recall_number, firm_name_raw, product_description)",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(20);
  const matches: RecentMatchRow[] = (matchesRaw ?? []) as unknown as RecentMatchRow[];

  // Stripe subscription details
  let trialEndsAt: string | null = null;
  let subscriptionStatus = "unknown";
  try {
    const subs = await stripe.subscriptions.list({
      customer: customer.stripe_customer_id,
      status: "all",
      limit: 1,
    });
    const sub = subs.data[0];
    if (sub) {
      subscriptionStatus = sub.status;
      if (sub.trial_end) {
        trialEndsAt = new Date(sub.trial_end * 1000).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    }
  } catch (err) {
    console.error("/account: stripe subscription lookup failed:", err);
  }

  // Customer Portal session URL
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.label.watch";
  let portalUrl: string | null = null;
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${origin}/account`,
    });
    portalUrl = portal.url;
  } catch (err) {
    console.error("/account: portal session create failed:", err);
  }

  // Mint an audit-access token so the dashboard can link to /audit?t=...
  // The token is short-lived from the customer's perspective (180 days TTL
  // at sign time) but practically permanent for our cadence — we re-mint
  // on every dashboard load. No need to display it; just embed in the link.
  let auditUrl: string | null = null;
  try {
    const token = signAuditToken(customer.id);
    auditUrl = `/audit?t=${encodeURIComponent(token)}`;
  } catch (err) {
    console.error("/account: audit token mint failed:", err);
  }

  return {
    customer,
    profile,
    channels,
    matches,
    trialEndsAt,
    subscriptionStatus,
    portalUrl,
    auditUrl,
  };
}

const s = {
  page: {
    minHeight: "100vh",
    background: "var(--color-bg-base)",
    color: "var(--color-text-primary)",
    fontFamily: "var(--font-jetbrains), monospace",
  } as CSSProperties,
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 40px",
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase" as const,
    borderBottom: "1px solid var(--color-border-subtle)",
  } as CSSProperties,
  brand: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontSize: 22,
    letterSpacing: -0.5,
    textTransform: "none" as const,
  } as CSSProperties,
  container: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "60px 40px",
  } as CSSProperties,
  h1: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontSize: 56,
    lineHeight: 1.05,
    letterSpacing: -1,
    margin: "0 0 12px",
    fontWeight: 400,
  } as CSSProperties,
  sub: {
    fontSize: 14,
    color: "var(--color-text-secondary)",
    margin: "0 0 48px",
  } as CSSProperties,
  banner: {
    background: "var(--color-bg-card)",
    border: "1px solid var(--color-border-subtle)",
    padding: "24px 28px",
    borderRadius: 4,
    margin: "0 0 32px",
  } as CSSProperties,
  bannerLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: "var(--color-signal-red)",
    margin: "0 0 8px",
  } as CSSProperties,
  bannerTitle: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontSize: 26,
    margin: "0 0 6px",
    fontWeight: 400,
  } as CSSProperties,
  bannerMeta: {
    fontSize: 13,
    color: "var(--color-text-secondary)",
  } as CSSProperties,
  section: {
    margin: "0 0 32px",
  } as CSSProperties,
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: "var(--color-text-muted)",
    margin: "0 0 12px",
  } as CSSProperties,
  card: {
    background: "var(--color-bg-card)",
    border: "1px solid var(--color-border-subtle)",
    padding: "20px 24px",
    borderRadius: 4,
  } as CSSProperties,
  kv: {
    display: "grid",
    gridTemplateColumns: "180px 1fr",
    gap: "10px 20px",
    fontSize: 14,
  } as CSSProperties,
  kvKey: {
    color: "var(--color-text-muted)",
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase" as const,
  } as CSSProperties,
  pillRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  } as CSSProperties,
  pill: {
    background: "var(--color-bg-input)",
    border: "1px solid var(--color-border-subtle)",
    padding: "4px 10px",
    borderRadius: 12,
    fontSize: 12,
  } as CSSProperties,
  manageBtn: {
    display: "inline-block",
    background: "var(--color-signal-red)",
    color: "#fff",
    padding: "12px 22px",
    borderRadius: 4,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    textDecoration: "none",
    fontWeight: 500,
  } as CSSProperties,
  manageBtnDisabled: {
    display: "inline-block",
    background: "var(--color-bg-input)",
    color: "var(--color-text-muted)",
    padding: "12px 22px",
    borderRadius: 4,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    fontWeight: 500,
    cursor: "not-allowed",
  } as CSSProperties,
  matchRow: {
    display: "grid",
    gridTemplateColumns: "70px 1fr 100px",
    gap: 16,
    padding: "12px 0",
    borderBottom: "1px solid var(--color-border-subtle)",
    fontSize: 13,
    alignItems: "start",
  } as CSSProperties,
  classI: { color: "var(--color-signal-red)", fontWeight: 600 } as CSSProperties,
  classII: { color: "var(--color-text-secondary)" } as CSSProperties,
  classIII: { color: "var(--color-text-muted)" } as CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--color-text-muted)",
    fontStyle: "italic" as const,
    padding: "12px 0",
  } as CSSProperties,
  signingSecretBanner: {
    background: "rgba(198, 58, 31, 0.1)",
    border: "1px solid var(--color-signal-red)",
    padding: "20px 24px",
    margin: "0 0 32px",
    borderRadius: 4,
  } as CSSProperties,
  pre: {
    background: "var(--color-bg-base)",
    color: "var(--color-text-primary)",
    padding: 14,
    borderRadius: 3,
    fontSize: 11,
    overflowX: "auto" as const,
    margin: "12px 0 0",
    fontFamily: "var(--font-jetbrains), monospace",
    userSelect: "all" as const,
  } as CSSProperties,
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const customerId = await resolveCustomerId(params);
  if (!customerId) redirect("/?account=signin");

  const data = await loadDashboardData(customerId);
  if (!data) redirect("/?account=not_found");

  const { customer, profile, channels, matches, trialEndsAt, subscriptionStatus, portalUrl, auditUrl } = data;

  const tierLabel = customer.tier.charAt(0).toUpperCase() + customer.tier.slice(1);
  const statusBadge =
    subscriptionStatus === "trialing"
      ? `${tierLabel} · trial${trialEndsAt ? ` ends ${trialEndsAt}` : ""}`
      : subscriptionStatus === "active"
        ? `${tierLabel} · active`
        : `${tierLabel} · ${subscriptionStatus}`;

  const signingSecret = params.signing_secret;

  return (
    <main style={s.page}>
      <div style={s.topbar}>
        <Link href="/" style={{ ...s.brand, color: "var(--color-text-primary)", textDecoration: "none" }}>
          label<span style={{ color: "var(--color-signal-red)" }}>.</span>watch
        </Link>
        <span>Dashboard</span>
      </div>

      <div style={s.container}>
        <h1 style={s.h1}>Your watch.</h1>
        <p style={s.sub}>{customer.firm_name} · {customer.email}</p>

        {signingSecret && (
          <div style={s.signingSecretBanner}>
            <p style={{ ...s.bannerLabel, color: "var(--color-signal-red)" }}>
              ⚠ HTTP webhook signing secret — save now
            </p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>
              Use this to verify the X-LabelWatch-Signature header on incoming webhook deliveries.
              Shown ONCE — there is no API to retrieve it later.
            </p>
            <pre style={s.pre}>{signingSecret}</pre>
          </div>
        )}

        <div style={s.banner}>
          <p style={s.bannerLabel}>Subscription</p>
          <h2 style={s.bannerTitle}>{statusBadge}</h2>
          <p style={s.bannerMeta}>
            {portalUrl ? (
              <a href={portalUrl} style={s.manageBtn}>
                Manage subscription →
              </a>
            ) : (
              <span style={s.manageBtnDisabled}>Manage subscription unavailable</span>
            )}
            {auditUrl && (
              <a href={auditUrl} style={{ ...s.manageBtn, marginLeft: 12, background: "transparent", border: "1px solid var(--color-signal-red)", color: "var(--color-signal-red)" }}>
                Run listing-copy audit →
              </a>
            )}
          </p>
        </div>

        <section style={s.section}>
          <p style={s.sectionTitle}>Watched scope</p>
          <div style={s.card}>
            <div style={s.kv}>
              <div style={s.kvKey}>Firm</div>
              <div>{customer.firm_name}</div>
              {profile.firm_aliases.length > 0 && (
                <>
                  <div style={s.kvKey}>DBAs / aliases</div>
                  <div style={s.pillRow}>
                    {profile.firm_aliases.map((a) => (
                      <span key={a} style={s.pill}>{a}</span>
                    ))}
                  </div>
                </>
              )}
              <div style={s.kvKey}>Ingredient categories</div>
              <div style={s.pillRow}>
                {profile.ingredient_categories.length === 0 ? (
                  <span style={s.empty}>None — alerts limited to firm-name matches.</span>
                ) : (
                  profile.ingredient_categories.map((c) => (
                    <span key={c} style={s.pill}>{c}</span>
                  ))
                )}
              </div>
              <div style={s.kvKey}>Min severity</div>
              <div>Class {profile.severity_preferences?.default_min_class ?? "II"} or higher</div>
            </div>
          </div>
        </section>

        <section style={s.section}>
          <p style={s.sectionTitle}>Delivery channels</p>
          <div style={s.card}>
            {channels.length === 0 ? (
              <p style={s.empty}>No channels configured. Re-onboard to set one up.</p>
            ) : (
              channels.map((ch, i) => (
                <div key={i} style={{ ...s.kv, borderTop: i > 0 ? "1px solid var(--color-border-subtle)" : "none", paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0 }}>
                  <div style={s.kvKey}>Channel {i + 1}</div>
                  <div>{ch.type} {ch.enabled ? "" : "(disabled)"}</div>
                  <div style={s.kvKey}>Destination</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", wordBreak: "break-all" }}>
                    {channelDestinationLabel(ch)}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={s.section}>
          <p style={s.sectionTitle}>Recent matches (last 20)</p>
          <div style={s.card}>
            {matches.length === 0 ? (
              <p style={s.empty}>
                No matches yet. New recalls will appear here as they publish and match your watch profile.
              </p>
            ) : (
              matches.map((m) => (
                <div key={m.id} style={s.matchRow}>
                  <span style={severityStyle(m.severity_class)}>{m.severity_class}</span>
                  <div>
                    <div style={{ marginBottom: 4 }}>{m.recall?.firm_name_raw ?? "(firm unknown)"}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      {m.recall?.product_description ?? "(no description)"}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "right" }}>
                    {m.status === "sent" ? "delivered" : m.status}
                    <br />
                    {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <p style={{ ...s.empty, textAlign: "center" as const, marginTop: 60, fontStyle: "normal" as const }}>
          Need to change scope or channels? Reply to any LabelWatch email and we'll update it.
        </p>
      </div>
    </main>
  );
}

function channelDestinationLabel(ch: ChannelRow): string {
  const cfg = ch.config as Record<string, unknown>;
  if (ch.type === "email") return String(cfg.address ?? "");
  if (ch.type === "slack" || ch.type === "teams") {
    const url = String(cfg.webhook_url ?? "");
    return url.length > 60 ? `${url.slice(0, 50)}…${url.slice(-10)}` : url;
  }
  if (ch.type === "http") return String(cfg.url ?? "");
  return "";
}

function severityStyle(cls: string): CSSProperties {
  if (cls === "Class I") return s.classI;
  if (cls === "Class II") return s.classII;
  return s.classIII;
}
