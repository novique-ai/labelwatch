import Link from "next/link";
import SignupForm from "./signup-form";
import CheckoutButton from "./checkout-button";
import PricingCta from "./pricing-cta";
import RiskMeter from "./risk-meter";
import RecallStrip from "./recall-strip";
import { fetchRecentSupplementRecalls } from "@/lib/recalls";

export const revalidate = 3600;

const TODAY = new Date().toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const TIERS = [
  {
    name: "Starter",
    price: "$39",
    cadence: "/mo",
    blurb: "Dietary-supplement desk, email + Slack, 7-day history.",
    features: [
      "One vertical (supplements)",
      "Email digest + Slack webhook",
      "Daily cadence",
      "7-day history",
    ],
    tierId: "starter" as const,
    accent: false,
  },
  {
    name: "Pro",
    price: "$99",
    cadence: "/mo",
    blurb: "Everything in Starter, plus all channels, enrichment, 12-mo history.",
    features: [
      "All verticals, all channels",
      "Slack + Teams + generic webhook",
      "Firm normalization + peer watch",
      "12-month history + severity filter",
    ],
    tierId: "pro" as const,
    accent: true,
  },
  {
    name: "Team",
    price: "$299",
    cadence: "/mo",
    blurb: "Multi-seat, API access, CSV audit export, priority support.",
    features: [
      "Multi-user (up to 5 seats)",
      "REST API + CSV export",
      "Custom alert rules",
      "Priority support",
    ],
    tierId: "team" as const,
    accent: false,
  },
];

import type { CSSProperties } from "react";

const s = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  } as CSSProperties,

  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 40px",
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#807a6c",
  } as CSSProperties,

  brand: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontSize: 22,
    fontStyle: "italic",
    textTransform: "none",
    letterSpacing: -0.5,
    color: "#ece5d6",
  } as CSSProperties,

  hero: {
    padding: "40px 40px 60px",
    display: "grid",
    gridTemplateColumns: "1fr 320px 1fr",
    gap: 40,
    alignItems: "center",
  } as CSSProperties,

  eyebrow: {
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#c63a1f",
    marginBottom: 20,
    textAlign: "right",
  } as CSSProperties,

  headline: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontWeight: 400,
    fontSize: 88,
    lineHeight: 0.95,
    letterSpacing: -2.5,
    margin: 0,
    color: "#ece5d6",
    textAlign: "right",
  } as CSSProperties,

  headlineSub: {
    textAlign: "right",
    marginTop: 18,
    maxWidth: 420,
    marginLeft: "auto",
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#9a9485",
    lineHeight: 1.7,
  } as CSSProperties,

  rightEyebrow: {
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#807a6c",
    marginBottom: 14,
  } as CSSProperties,

  pitch: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontSize: 22,
    lineHeight: 1.32,
    color: "#ece5d6",
    maxWidth: 360,
  } as CSSProperties,

  subPitch: {
    fontSize: 13,
    lineHeight: 1.55,
    color: "#9a9485",
    marginTop: 18,
    maxWidth: 360,
    fontFamily: "system-ui, sans-serif",
  } as CSSProperties,

  fineprint: {
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 9.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#807a6c",
    marginTop: 14,
    maxWidth: 360,
  } as CSSProperties,

  sectionRule: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "24px 40px",
  } as CSSProperties,

  hr: {
    flex: 1,
    height: 1,
    background: "#2a2a26",
    border: "none",
    margin: 0,
  } as CSSProperties,

  sectionLabel: {
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 10,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#807a6c",
    whiteSpace: "nowrap",
  } as CSSProperties,

  wireSection: {
    borderTop: "1px solid #2a2a26",
    borderBottom: "1px solid #2a2a26",
  } as CSSProperties,

  wireItem: {
    padding: "20px 40px",
    borderBottom: "1px solid #2a2a26",
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    gap: "0 24px",
    alignItems: "baseline",
  } as CSSProperties,

  wireItemMobile: {
    padding: "16px 20px",
    borderBottom: "1px solid #2a2a26",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } as CSSProperties,

  wireFooter: {
    padding: "12px 40px",
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 9.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#807a6c",
    lineHeight: 1.7,
  } as CSSProperties,

  compSection: {
    borderTop: "1px solid #2a2a26",
    borderBottom: "1px solid #2a2a26",
  } as CSSProperties,

  compGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    border: "1px solid #2a2a26",
    margin: "0 40px 40px",
  } as CSSProperties,

  compFree: {
    padding: 32,
    borderRight: "1px solid #2a2a26",
  } as CSSProperties,

  compPaid: {
    padding: 32,
    background: "rgba(20,20,18,0.6)",
  } as CSSProperties,

  compTitle: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontSize: 22,
    color: "#ece5d6",
    marginTop: 8,
    lineHeight: 1.2,
  } as CSSProperties,

  compList: {
    marginTop: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#9a9485",
    lineHeight: 1.5,
  } as CSSProperties,

  pricingSection: {
    borderTop: "1px solid #2a2a26",
    borderBottom: "1px solid #2a2a26",
  } as CSSProperties,

  pricingGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 14,
    padding: "0 40px 40px",
  } as CSSProperties,

  pricingCard: (accent: boolean): CSSProperties => ({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    padding: 28,
    border: `1px solid ${accent ? "#c63a1f" : "#2a2a26"}`,
    background: accent ? "rgba(198,58,31,0.08)" : "rgba(20,20,18,0.5)",
  }),

  pricingPrice: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontSize: 56,
    fontWeight: 400,
    lineHeight: 1,
    color: "#ece5d6",
    marginTop: 16,
  } as CSSProperties,

  pricingList: {
    marginTop: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#9a9485",
    lineHeight: 1.6,
    flex: 1,
  } as CSSProperties,

  colophonSection: {
    borderTop: "1px solid #2a2a26",
  } as CSSProperties,

  colophonGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 40,
    padding: "32px 40px 48px",
  } as CSSProperties,

  colophonLabel: {
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 10,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#807a6c",
    marginBottom: 8,
  } as CSSProperties,

  colophonBody: {
    fontFamily: "system-ui, sans-serif",
    fontSize: 13,
    color: "#9a9485",
    lineHeight: 1.6,
  } as CSSProperties,

  footer: {
    borderTop: "1px solid #2a2a26",
    padding: "16px 40px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#807a6c",
  } as CSSProperties,
};

function SectionRule({ label }: { label: string }) {
  return (
    <div style={s.sectionRule} className="section-rule">
      <hr style={s.hr} />
      <span style={s.sectionLabel}>{label}</span>
      <hr style={s.hr} />
    </div>
  );
}

function WireClassPill({ cls }: { cls: string }) {
  const bg =
    cls === "Class I"
      ? "#c63a1f"
      : cls === "Class II"
        ? "#3a3a3a"
        : "#8a8a82";
  const label =
    cls === "Class I" ? "CLASS I" : cls === "Class II" ? "CLASS II" : "CLASS III";
  return (
    <span
      style={{
        background: bg,
        color: "#fff",
        fontFamily: "var(--font-jetbrains), monospace",
        fontSize: 10,
        fontWeight: 600,
        padding: "3px 7px",
        letterSpacing: 0.6,
        display: "inline-block",
        flexShrink: 0,
        alignSelf: "flex-start",
      }}
    >
      {label}
    </span>
  );
}

export default async function Home() {
  const recalls = await fetchRecentSupplementRecalls(6);
  const portalLoginUrl = process.env.NEXT_PUBLIC_STRIPE_PORTAL_LOGIN_URL;
  const liveCheckout = process.env.NEXT_PUBLIC_LIVE_CHECKOUT === "true";

  const recallCount = Math.min(recalls.length, 10);
  const class1Count = recalls.filter(
    (r) => r.classification === "Class I"
  ).length;

  return (
    <div style={s.page}>
      {/* Top bar */}
      <header style={s.topbar}>
        <span style={s.brand}>LabelWatch</span>
        <span>The recall wire for supplement brands</span>
        <span>Vol. I · {TODAY}</span>
      </header>

      {/* Hero — 3-column grid */}
      <section>
        <div
          className="hero-grid"
          style={s.hero}
        >
          {/* Left: typographic headline */}
          <div>
            <div style={s.eyebrow}>Volume I · Lead story</div>
            <h1 style={s.headline}>
              Amazon's 2026
              <br />
              testing rule decides
              <br />
              what stays on shelf.
            </h1>
            <div style={s.headlineSub}>
              LabelWatch scores every SKU against the new requirements — fix
              the gaps before takedowns hit Q4.
            </div>
          </div>

          {/* Center: risk meter */}
          <div>
            <RiskMeter count={recallCount} class1Count={class1Count} />
          </div>

          {/* Right: pitch + capture */}
          <div id="waitlist">
            <div style={s.rightEyebrow}>What LabelWatch does</div>
            <div style={s.pitch}>
              Every FDA dietary-supplement recall — normalized, peer-watched on
              your category, routed to <em>Slack</em>, <em>Teams</em>, or your
              webhook, with a CSV audit trail you can hand to a regulator.
            </div>
            <div style={s.subPitch}>
              From $39/mo. The intelligence layer on top of openFDA, built for
              Shopify-tier supplement brands — not the $500/mo enterprise
              platforms.
            </div>
            <div style={{ marginTop: 28 }}>
              <SignupForm tier="starter" />
            </div>
            <div style={s.fineprint}>
              No credit card · founding cohort · one email when we open.
            </div>
          </div>
        </div>

        {/* Recall strip */}
        <RecallStrip recalls={recalls} total={recalls.length} />
      </section>

      {/* The Wire — live recall feed */}
      <section style={s.wireSection}>
        <SectionRule label="The Wire · Recent FDA recalls" />
        <div>
          {recalls.length === 0 ? (
            <div
              style={{
                padding: "32px 40px",
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 11,
                color: "#807a6c",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Wire is quiet. Check back shortly.
            </div>
          ) : (
            <>
              {recalls.map((r) => (
                <div
                  key={r.recallNumber || `${r.firm}-${r.date}`}
                  style={s.wireItem}
                  className="wire-item"
                >
                  <WireClassPill cls={r.classification} />
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-instrument-serif), serif",
                        fontSize: 20,
                        lineHeight: 1.2,
                        color: "#ece5d6",
                      }}
                    >
                      {r.firm || "Firm undisclosed"}
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        fontFamily: "system-ui, sans-serif",
                        fontSize: 13,
                        color: "#9a9485",
                        lineHeight: 1.5,
                      }}
                    >
                      {r.product}
                    </div>
                    {r.reason && (
                      <div
                        style={{
                          marginTop: 4,
                          fontFamily: "var(--font-jetbrains), monospace",
                          fontSize: 10,
                          letterSpacing: 0.8,
                          textTransform: "uppercase",
                          color: "#807a6c",
                        }}
                      >
                        Reason: {r.reason}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-jetbrains), monospace",
                      fontSize: 10,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "#807a6c",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.date || "—"}
                  </div>
                </div>
              ))}
            </>
          )}
          <div style={s.wireFooter} className="wire-footer">
            Source: openFDA food/enforcement · cached hourly · LabelWatch
            customers get these within 15 minutes of FDA publication, routed to
            Slack/Teams/webhook.
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section style={s.compSection}>
        <SectionRule label="Comparative · Free FDA service vs LabelWatch" />
        <div style={s.compGrid} className="comp-grid">
          <div style={s.compFree}>
            <div
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 10,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#807a6c",
              }}
            >
              Free · FDA Enforcement Report subscription
            </div>
            <div style={s.compTitle}>Email. Five keywords. That's it.</div>
            <div style={s.compList}>
              <div>· Email delivery only</div>
              <div>· Up to 5 keyword rules</div>
              <div>· Weekly cadence, no enrichment</div>
              <div>· No normalization across firm DBAs</div>
              <div>· No peer / ingredient-category watch</div>
              <div>· No audit export</div>
            </div>
          </div>
          <div style={s.compPaid}>
            <div
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 10,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#c63a1f",
              }}
            >
              LabelWatch · From $39/mo
            </div>
            <div style={s.compTitle}>
              Slack. Teams. Webhooks. Peer watch. History.
            </div>
            <div style={s.compList}>
              <div>· Slack + Teams + generic HTTP webhook</div>
              <div>· Firm-name normalization (catches DBAs, subsidiaries)</div>
              <div>· Ingredient-category peer watch</div>
              <div>· Class I / II / III severity routing</div>
              <div>· 7-day to 12-month searchable history</div>
              <div>· CSV / API export for compliance audits</div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={s.pricingSection}>
        <SectionRule label="Terms · Three tiers" />
        <div style={s.pricingGrid} className="pricing-grid">
          {TIERS.map((t) => (
            <div key={t.tierId} style={s.pricingCard(t.accent)}>
              {t.accent && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    left: 20,
                    background: "#c63a1f",
                    color: "#fff",
                    fontFamily: "var(--font-jetbrains), monospace",
                    fontSize: 9,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    fontWeight: 600,
                    padding: "3px 8px",
                  }}
                >
                  Most chosen
                </div>
              )}
              <div
                style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: t.accent ? "#c63a1f" : "#807a6c",
                }}
              >
                {t.name}
              </div>
              <div style={s.pricingPrice}>
                {t.price}
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains), monospace",
                    fontSize: 13,
                    fontWeight: 400,
                    letterSpacing: 0,
                    color: "#807a6c",
                    marginLeft: 4,
                  }}
                >
                  {t.cadence}
                </span>
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontFamily: "var(--font-jetbrains), monospace",
                  fontSize: 9,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: "#807a6c",
                }}
              >
                Founding-cohort pricing locked
              </div>
              <div
                style={{
                  marginTop: 12,
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 13,
                  color: "#9a9485",
                  lineHeight: 1.55,
                }}
              >
                {t.blurb}
              </div>
              <div style={s.pricingList}>
                {t.features.map((f) => (
                  <div key={f}>· {f}</div>
                ))}
              </div>
              <div style={{ marginTop: 24 }}>
                {liveCheckout ? (
                  <CheckoutButton
                    tier={t.tierId}
                    label="Start 14-day free trial"
                    accent={t.accent}
                  />
                ) : (
                  <PricingCta accent={t.accent} />
                )}
              </div>
            </div>
          ))}
        </div>
        <div
          className="pricing-footer"
          style={{
            padding: "0 40px 32px",
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 9.5,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "#807a6c",
            textAlign: "center",
          }}
        >
          {liveCheckout
            ? "No charge for 14 days — card required to hold your spot · Cancel anytime inside the portal."
            : "Coming soon. Founding-cohort pricing locked at these rates. Join the waitlist — we'll email once."}
        </div>
      </section>

      {/* Colophon */}
      <section style={s.colophonSection}>
        <SectionRule label="Colophon" />
        <div style={s.colophonGrid} className="colophon-grid">
          <div>
            <div style={s.colophonLabel}>Published by</div>
            <div style={s.colophonBody}>
              <Link
                href="https://novique.ai"
                style={{ color: "#9a9485", textDecoration: "underline", textDecorationColor: "rgba(198,58,31,0.4)" }}
              >
                Novique.ai
              </Link>{" "}
              provides AI solutions for small to mid-size businesses.
            </div>
          </div>
          <div>
            <div style={s.colophonLabel}>Data & cadence</div>
            <div style={s.colophonBody}>
              Sourced from openFDA food/enforcement endpoint. FDA data is
              public-domain. LabelWatch is not affiliated with the U.S. Food &amp;
              Drug Administration.
            </div>
          </div>
          <div>
            <div style={s.colophonLabel}>Talk to us</div>
            <div style={s.colophonBody}>
              Research interviews in progress. Supplements-industry operators who
              want input on feature priorities —{" "}
              <Link
                href="/contact"
                style={{ color: "#9a9485", textDecoration: "underline", textDecorationColor: "rgba(198,58,31,0.4)" }}
              >
                send us a message
              </Link>
              .
            </div>
            {portalLoginUrl && (
              <div style={{ marginTop: 16, ...s.colophonBody }}>
                <a
                  href={portalLoginUrl}
                  style={{ color: "#9a9485", textDecoration: "underline", textDecorationColor: "rgba(198,58,31,0.4)" }}
                >
                  Manage your subscription
                </a>
                <br />
                <span style={{ color: "#807a6c" }}>
                  Existing customers — sign in with the email on your account.
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer style={s.footer} className="site-footer">
        <span>© {new Date().getFullYear()} Novique.ai · LabelWatch</span>
        <span>label.watch · labelwatch.app</span>
      </footer>

      {/* Responsive styles — hero collapse at <960px, strip scroll on mobile */}
      <style>{`
        @media (max-width: 959px) {
          .hero-grid {
            display: flex !important;
            flex-direction: column !important;
            padding: 32px 24px 48px !important;
            gap: 40px !important;
          }
          .hero-grid > div:first-child h1 {
            font-size: 56px !important;
            text-align: left !important;
            letter-spacing: -1.5px !important;
          }
          .hero-grid > div:first-child > div:first-child {
            text-align: left !important;
          }
          .hero-grid > div:first-child > div:last-child {
            text-align: left !important;
            margin-left: 0 !important;
          }
          .recall-cards-grid {
            display: flex !important;
            overflow-x: auto !important;
            scroll-snap-type: x mandatory !important;
            gap: 12px !important;
            padding-bottom: 8px !important;
            -webkit-overflow-scrolling: touch;
          }
          .recall-cards-grid > * {
            scroll-snap-align: start !important;
            flex-shrink: 0 !important;
          }
          .comp-grid {
            display: flex !important;
            flex-direction: column !important;
            margin: 0 20px 32px !important;
          }
          .comp-grid > div:first-child {
            border-right: none !important;
            border-bottom: 1px solid #2a2a26 !important;
          }
          .pricing-grid {
            display: flex !important;
            flex-direction: column !important;
            padding: 0 20px 32px !important;
            gap: 12px !important;
          }
          .colophon-grid {
            display: flex !important;
            flex-direction: column !important;
            padding: 24px 20px 40px !important;
            gap: 28px !important;
          }
          .site-footer {
            padding: 16px 20px !important;
            flex-direction: column !important;
            gap: 8px !important;
            text-align: center !important;
          }
          .wire-item {
            display: flex !important;
            flex-direction: column !important;
            gap: 6px !important;
            padding: 16px 20px !important;
          }
          .wire-item > div:last-child {
            text-align: left !important;
          }
        }

        @media (max-width: 480px) {
          header[style] {
            padding: 14px 20px !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
          }
          header[style] > span:nth-child(2) {
            display: none !important;
          }
          .section-rule {
            padding: 20px 20px !important;
          }
          .wire-footer {
            padding: 12px 20px !important;
          }
          .pricing-footer {
            padding: 0 20px 24px !important;
          }
        }
      `}</style>
    </div>
  );
}
