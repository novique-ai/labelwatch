import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AMAZON_TIC_POLICY_URL,
  AMAZON_FAST_TRACK_URL,
  RULESET_LAST_REVIEWED,
} from "@/lib/amazon-tic-rules";

export const metadata: Metadata = {
  title: "References — Authoritative sources for FDA recall and Amazon TIC compliance | LabelWatch",
  description:
    "The authoritative external sources LabelWatch scores and notifies against — Amazon Seller Central dietary supplements policy, FDA openFDA, 21 CFR Part 111 and 101.36, approved TIC organizations.",
  alternates: {
    canonical: "https://label.watch/references",
  },
};

interface Source {
  title: string;
  href: string;
  blurb: string;
  authGated?: boolean;
}

const AMAZON: Source[] = [
  {
    title: "Amazon Seller Central — Dietary Supplements policy",
    href: AMAZON_TIC_POLICY_URL,
    blurb:
      "The primary policy page. Defines the 2026 Third-party Testing-Inspection-Certification (TIC) requirement that applies to every dietary supplement listed on Amazon. Expanded from category-specific to all-supplements in the December 2025 announcement.",
    authGated: true,
  },
  {
    title: "Amazon Compliance Fast-Track program",
    href: AMAZON_FAST_TRACK_URL,
    blurb:
      "Auto-validates compliance status for products already certified by Amazon's Fast-Track partners — eliminates the documentation submission step for participating brands.",
    authGated: true,
  },
];

const FDA: Source[] = [
  {
    title: "openFDA Food Enforcement API",
    href: "https://open.fda.gov/apis/food/enforcement/",
    blurb:
      "The FDA's public recall data feed. LabelWatch's recall radar polls this endpoint and normalizes the firm names, classifications, and ingredient categories before routing alerts.",
  },
  {
    title: "21 CFR Part 111 — cGMP for dietary supplements",
    href: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-111",
    blurb:
      "The federal current Good Manufacturing Practice rule for dietary supplements. Amazon's TIC requirement specifically demands a GMP certificate compliant with 21 CFR Part 111 (or 117) from an accredited third-party body.",
  },
  {
    title: "21 CFR 101.36 — Nutrition labeling of dietary supplements",
    href: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.36",
    blurb:
      "The federal labeling rule that defines Supplement Facts panel content and format. Several of LabelWatch's TIC checks reference this rule directly.",
  },
  {
    title: "FDA recall classification (Class I, II, III)",
    href: "https://www.fda.gov/safety/industry-guidance-recalls/recalls-background-and-definitions",
    blurb:
      "The FDA's definition of recall severity classes. Class I (reasonable probability of serious adverse health consequences or death) is the routing tier LabelWatch surfaces first.",
  },
];

const APPROVED_TIC: { name: string; href: string }[] = [
  { name: "Certified Laboratories", href: "https://certified-laboratories.com/" },
  { name: "Eurofins", href: "https://www.eurofinsus.com/" },
  { name: "ITS-Intertek", href: "https://www.intertek.com/" },
  { name: "Mérieux NutriSciences", href: "https://www.merieuxnutrisciences.com/" },
  { name: "NSF", href: "https://www.nsf.org/" },
  { name: "SGS", href: "https://www.sgs.com/" },
  { name: "UL — Underwriters Laboratories", href: "https://www.ul.com/" },
];

const FAST_TRACK_PARTNERS: { name: string; href: string }[] = [
  { name: "BSCG", href: "https://www.bscg.org/" },
  { name: "Clean Label Project", href: "https://cleanlabelproject.org/" },
  { name: "GRMA — Global Retailer & Manufacturer Alliance", href: "https://grmaglobal.org/" },
  { name: "Informed (LGC)", href: "https://choice.wetestyoutrust.com/" },
  { name: "NSF", href: "https://www.nsf.org/" },
  { name: "USP — United States Pharmacopeia", href: "https://www.usp.org/" },
];

const s = {
  page: {
    minHeight: "100vh",
    background: "#0e0c0a",
    color: "#ece5d6",
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 14,
    lineHeight: 1.65,
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
    textDecoration: "none",
  } as CSSProperties,

  main: {
    maxWidth: 880,
    margin: "0 auto",
    padding: "40px 40px 80px",
  } as CSSProperties,

  h1: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontWeight: 400,
    fontSize: 56,
    letterSpacing: -1.5,
    lineHeight: 1.05,
    margin: "8px 0 16px",
    color: "#ece5d6",
  } as CSSProperties,

  eyebrow: {
    fontFamily: "var(--font-jetbrains), monospace",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#807a6c",
  } as CSSProperties,

  lead: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontWeight: 400,
    fontSize: 22,
    lineHeight: 1.45,
    color: "#c8c1b1",
    marginBottom: 8,
  } as CSSProperties,

  ruleReviewed: {
    marginTop: 32,
    paddingTop: 16,
    borderTop: "1px solid #2a2a26",
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#807a6c",
  } as CSSProperties,

  section: {
    marginTop: 48,
  } as CSSProperties,

  h2: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontWeight: 400,
    fontSize: 32,
    letterSpacing: -0.5,
    lineHeight: 1.15,
    margin: "0 0 8px",
    color: "#ece5d6",
  } as CSSProperties,

  sectionIntro: {
    color: "#9a9485",
    marginBottom: 20,
    fontSize: 13,
  } as CSSProperties,

  sourceList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "grid",
    gap: 18,
  } as CSSProperties,

  source: {
    borderLeft: "2px solid #2a2a26",
    paddingLeft: 16,
  } as CSSProperties,

  sourceTitle: {
    fontFamily: "var(--font-instrument-serif), serif",
    fontSize: 18,
    lineHeight: 1.3,
    margin: "0 0 4px",
  } as CSSProperties,

  sourceLink: {
    color: "#ece5d6",
    textDecoration: "underline",
    textDecorationColor: "#5a5550",
    textUnderlineOffset: 3,
  } as CSSProperties,

  authBadge: {
    display: "inline-block",
    marginLeft: 8,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#807a6c",
    border: "1px solid #2a2a26",
    padding: "2px 6px",
    borderRadius: 2,
    verticalAlign: "middle",
  } as CSSProperties,

  sourceBlurb: {
    color: "#9a9485",
    fontSize: 13,
    margin: 0,
  } as CSSProperties,

  partnerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 12,
    listStyle: "none",
    padding: 0,
    margin: 0,
  } as CSSProperties,

  partnerItem: {
    border: "1px solid #2a2a26",
    padding: "12px 14px",
    borderRadius: 3,
  } as CSSProperties,

  partnerLink: {
    color: "#ece5d6",
    textDecoration: "none",
    display: "block",
    fontSize: 13,
  } as CSSProperties,

  footer: {
    marginTop: 60,
    paddingTop: 24,
    borderTop: "1px solid #2a2a26",
    color: "#807a6c",
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  } as CSSProperties,

  footerNote: {
    fontFamily: "var(--font-jetbrains), monospace",
    lineHeight: 1.7,
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 12,
    color: "#9a9485",
    marginTop: 8,
  } as CSSProperties,

  contactLink: {
    color: "#ece5d6",
    textDecoration: "underline",
    textDecorationColor: "#5a5550",
    textUnderlineOffset: 3,
  } as CSSProperties,
};

function ext(href: string) {
  return { target: "_blank" as const, rel: "noopener noreferrer" as const, href };
}

function SourceItem({ source }: { source: Source }) {
  return (
    <li style={s.source}>
      <h3 style={s.sourceTitle}>
        <a {...ext(source.href)} style={s.sourceLink}>
          {source.title}
        </a>
        {source.authGated ? (
          <span style={s.authBadge} title="Amazon Seller Central account required to view">
            Seller Central login
          </span>
        ) : null}
      </h3>
      <p style={s.sourceBlurb}>{source.blurb}</p>
    </li>
  );
}

export default function ReferencesPage() {
  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <Link href="/" style={s.brand}>
          LabelWatch
        </Link>
        <span>References · Sources</span>
      </div>

      <main style={s.main}>
        <div style={s.eyebrow}>Sources · last verified {RULESET_LAST_REVIEWED}</div>
        <h1 style={s.h1}>References</h1>
        <p style={s.lead}>
          The authoritative external sources LabelWatch scores against, polls,
          and links to. Where we cite a rule, this is where the rule lives.
        </p>

        <section style={s.section}>
          <h2 style={s.h2}>Amazon Seller Central</h2>
          <p style={s.sectionIntro}>
            The 2026 Amazon Third-party Testing-Inspection-Certification (TIC)
            requirement is the wedge LabelWatch's compliance scoring is built
            against. The primary policy page and the Fast-Track program page
            are both authoritative — both are gated to logged-in Amazon Seller
            Central users.
          </p>
          <ul style={s.sourceList}>
            {AMAZON.map((src) => (
              <SourceItem key={src.href} source={src} />
            ))}
          </ul>
        </section>

        <section style={s.section}>
          <h2 style={s.h2}>FDA &amp; federal regulations</h2>
          <p style={s.sectionIntro}>
            The recall radar polls FDA&apos;s openFDA endpoint. The TIC ruleset
            references federal regulations in 21 CFR (Title 21 of the Code of
            Federal Regulations) — these are the actual rules a supplement
            brand must comply with regardless of marketplace.
          </p>
          <ul style={s.sourceList}>
            {FDA.map((src) => (
              <SourceItem key={src.href} source={src} />
            ))}
          </ul>
        </section>

        <section style={s.section}>
          <h2 style={s.h2}>Approved TIC organizations</h2>
          <p style={s.sectionIntro}>
            Amazon&apos;s current list of approved Testing-Inspection-Certification
            providers. Sellers contacted by Amazon have 90 days to initiate a
            documentation request with one of these organizations. The TIC
            provider submits documentation to Amazon on the seller&apos;s behalf.
          </p>
          <ul style={s.partnerGrid}>
            {APPROVED_TIC.map((p) => (
              <li key={p.href} style={s.partnerItem}>
                <a {...ext(p.href)} style={s.partnerLink}>
                  {p.name} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section style={s.section}>
          <h2 style={s.h2}>Fast-Track certifying partners</h2>
          <p style={s.sectionIntro}>
            If your product is already certified by one of these organizations,
            Amazon&apos;s Compliance Fast-Track program auto-validates the
            certification — no separate documentation submission required.
          </p>
          <ul style={s.partnerGrid}>
            {FAST_TRACK_PARTNERS.map((p) => (
              <li key={p.href} style={s.partnerItem}>
                <a {...ext(p.href)} style={s.partnerLink}>
                  {p.name} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>

        <div style={s.ruleReviewed}>
          LabelWatch TIC ruleset last reviewed {RULESET_LAST_REVIEWED}
          <div style={s.footerNote}>
            Found an outdated link or a citation that doesn&apos;t check out?{" "}
            <Link href="/contact" style={s.contactLink}>
              Tell us
            </Link>{" "}
            — we&apos;ll verify within 24 hours and update this page.
          </div>
        </div>

        <div style={s.footer}>
          © {new Date().getFullYear()} Novique.ai · LabelWatch
        </div>
      </main>
    </div>
  );
}
