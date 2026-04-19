import Link from "next/link";
import SignupForm from "./signup-form";
import { fetchRecentSupplementRecalls } from "@/lib/recalls";

export const revalidate = 3600;

const TODAY = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
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

function SectionRule({ label }: { label: string }) {
  return (
    <div className="relative flex items-center gap-4 py-6 px-6 md:px-12">
      <div className="h-px flex-1 bg-ink/20" />
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
        {label}
      </span>
      <div className="h-px flex-1 bg-ink/20" />
    </div>
  );
}

export default async function Home() {
  const recalls = await fetchRecentSupplementRecalls(6);

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* Masthead */}
      <header className="border-b-2 border-ink">
        <div className="mx-auto max-w-6xl px-6 md:px-12 py-5 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.2em] text-ink-muted">
          <span>Vol. 1 · No. 1</span>
          <span className="hidden sm:inline">Published from Novique.ai · Dietary Supplements Desk</span>
          <span>{TODAY}</span>
        </div>
        <div className="mx-auto max-w-6xl px-6 md:px-12 pb-6 pt-2 text-center">
          <h1 className="font-display text-5xl sm:text-6xl md:text-8xl font-black tracking-tight text-ink ink-bleed">
            LABELWATCH
          </h1>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.4em] text-ink-muted">
            The recall wire for supplement brands.
          </p>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-6xl px-6 md:px-12 py-16 md:py-24 grid md:grid-cols-5 gap-10">
          <div className="md:col-span-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-recall mb-4">
              Volume I · Lead story
            </p>
            <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05] text-ink ink-bleed">
              FDA gives you five keywords.
              <br />
              We give you the whole shelf.
            </h2>
            <p className="mt-6 font-body text-lg text-ink-soft leading-relaxed max-w-xl">
              Every FDA dietary-supplement recall, normalized and delivered to{" "}
              <span className="font-mono text-sm text-recall">Slack</span>,{" "}
              <span className="font-mono text-sm text-recall">Teams</span>, or your{" "}
              <span className="font-mono text-sm text-recall">webhook</span>. Peer
              watch on your ingredient category. A CSV audit trail you can hand to
              a regulator. From <span className="font-display font-bold">$39/mo</span>.
            </p>
            <div className="mt-8">
              <SignupForm tier="starter" className="max-w-xl" />
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted">
                No credit card. Launching in 4 weeks. One email when the gates open.
              </p>
            </div>
          </div>
          <aside className="md:col-span-2 md:border-l md:border-rule md:pl-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink-muted mb-4">
              Standfirst
            </p>
            <p className="font-display text-xl leading-snug text-ink">
              The free FDA email works until the day your co-packer&apos;s other
              client gets a Class I — and nobody on your team knows for three
              weeks.
            </p>
            <p className="mt-6 font-body text-sm text-ink-muted leading-relaxed">
              LabelWatch is the intelligence layer on top of{" "}
              <a
                href="https://open.fda.gov/apis/food/enforcement/"
                className="underline decoration-recall/40 underline-offset-2 hover:decoration-recall"
                target="_blank"
                rel="noopener noreferrer"
              >
                openFDA
              </a>
              : normalization, peer watch, routing, history. Positioned below the
              $500/mo enterprise platforms. Built for Shopify-tier brands.
            </p>
          </aside>
        </div>
      </section>

      {/* The Wire — live recall feed */}
      <section className="border-b border-rule bg-paper-deep/30">
        <SectionRule label="The Wire · Recent FDA recalls" />
        <div className="mx-auto max-w-6xl px-6 md:px-12 pb-14">
          {recalls.length === 0 ? (
            <p className="font-mono text-sm text-ink-muted py-8">
              Wire is quiet. Check back shortly.
            </p>
          ) : (
            <ul className="divide-y divide-rule">
              {recalls.map((r) => (
                <li key={r.recallNumber || `${r.firm}-${r.date}`} className="py-5 grid md:grid-cols-[auto_1fr_auto] gap-x-6 gap-y-1 items-baseline">
                  <span
                    className={`font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm inline-block w-fit ${
                      r.classification.includes("I")
                        ? "bg-recall text-paper pulse-recall"
                        : r.classification.includes("II")
                          ? "bg-amber/80 text-ink"
                          : "bg-ink/10 text-ink"
                    }`}
                  >
                    {r.classification}
                  </span>
                  <div>
                    <p className="font-display text-lg font-semibold leading-snug text-ink">
                      {r.firm || "Firm undisclosed"}
                    </p>
                    <p className="mt-0.5 font-body text-sm text-ink-soft">
                      {r.product}
                    </p>
                    {r.reason && (
                      <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ink-muted">
                        Reason: {r.reason}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-wider text-ink-muted md:text-right">
                    {r.date || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted">
            Source: openFDA food/enforcement · cached hourly · LabelWatch
            customers get these within 15 minutes of FDA publication, routed to
            Slack/Teams/webhook.
          </p>
        </div>
      </section>

      {/* Why us vs free */}
      <section className="border-b border-rule">
        <SectionRule label="Comparative · Free FDA service vs LabelWatch" />
        <div className="mx-auto max-w-6xl px-6 md:px-12 pb-16">
          <div className="grid md:grid-cols-2 gap-0 border border-ink">
            <div className="p-8 border-b md:border-b-0 md:border-r border-ink/40">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
                Free · FDA Enforcement Report subscription
              </p>
              <h3 className="font-display text-2xl font-semibold text-ink">
                Email. Five keywords. That&apos;s it.
              </h3>
              <ul className="mt-5 space-y-2 font-body text-sm text-ink-soft">
                <li>· Email delivery only</li>
                <li>· Up to 5 keyword rules</li>
                <li>· Weekly cadence, no enrichment</li>
                <li>· No normalization across firm DBAs</li>
                <li>· No peer / ingredient-category watch</li>
                <li>· No audit export</li>
              </ul>
            </div>
            <div className="p-8 bg-ink text-paper">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber mb-2">
                LabelWatch · From $39/mo
              </p>
              <h3 className="font-display text-2xl font-semibold">
                Slack. Teams. Webhooks. Peer watch. History.
              </h3>
              <ul className="mt-5 space-y-2 font-body text-sm text-paper/80">
                <li>· Slack + Teams + generic HTTP webhook</li>
                <li>· Firm-name normalization (catches DBAs, subsidiaries)</li>
                <li>· Ingredient-category peer watch</li>
                <li>· Class I / II / III severity routing</li>
                <li>· 7-day → 12-month searchable history</li>
                <li>· CSV / API export for compliance audits</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-rule">
        <SectionRule label="Terms · Three tiers" />
        <div className="mx-auto max-w-6xl px-6 md:px-12 pb-20">
          <div className="grid md:grid-cols-3 gap-6">
            {TIERS.map((t) => (
              <div
                key={t.tierId}
                className={`relative flex flex-col p-7 border ${
                  t.accent
                    ? "border-ink bg-ink text-paper"
                    : "border-ink/50 bg-paper"
                }`}
              >
                {t.accent && (
                  <span className="absolute -top-3 left-6 bg-recall text-paper font-mono text-[10px] uppercase tracking-widest px-2 py-1">
                    Most chosen
                  </span>
                )}
                <p
                  className={`font-mono text-[11px] uppercase tracking-[0.3em] ${
                    t.accent ? "text-amber" : "text-ink-muted"
                  }`}
                >
                  {t.name}
                </p>
                <p className="mt-4 font-display text-5xl font-bold leading-none">
                  {t.price}
                  <span
                    className={`text-base font-body font-normal ml-1 ${
                      t.accent ? "text-paper/60" : "text-ink-muted"
                    }`}
                  >
                    {t.cadence}
                  </span>
                </p>
                <p
                  className={`mt-3 font-body text-sm ${
                    t.accent ? "text-paper/80" : "text-ink-soft"
                  }`}
                >
                  {t.blurb}
                </p>
                <ul
                  className={`mt-5 space-y-1.5 font-body text-sm ${
                    t.accent ? "text-paper/90" : "text-ink"
                  }`}
                >
                  {t.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
                <div className="mt-7">
                  <SignupForm
                    tier={t.tierId}
                    variant="compact"
                    className={t.accent ? "[&_input]:!bg-paper/10 [&_input]:!border-paper/30 [&_input]:!text-paper [&_input::placeholder]:!text-paper/40 [&_button]:!bg-recall [&_button]:!text-paper" : ""}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-muted text-center">
            Stripe Checkout wires up in a subsequent build · Today, early-access signups only.
          </p>
        </div>
      </section>

      {/* FAQ / colophon */}
      <section>
        <SectionRule label="Colophon" />
        <div className="mx-auto max-w-6xl px-6 md:px-12 pb-16 grid md:grid-cols-3 gap-10 font-body text-sm text-ink-soft">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
              Published by
            </p>
            <p>
              <Link
                href="https://novique.ai"
                className="underline decoration-recall/40 underline-offset-2 hover:decoration-recall"
              >
                Novique.ai
              </Link>{" "}
              — an automated SaaS factory. LabelWatch is the first vertical.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
              Data & cadence
            </p>
            <p>
              Sourced from openFDA food/enforcement endpoint. FDA data is
              public-domain. LabelWatch is not affiliated with the U.S. Food &amp;
              Drug Administration.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
              Talk to us
            </p>
            <p>
              <a
                href="mailto:hello@label.watch"
                className="underline decoration-recall/40 underline-offset-2 hover:decoration-recall"
              >
                hello@label.watch
              </a>
              <br />
              Research interviews in progress. Supplements-industry operators who
              want input on feature priorities — drop your email above.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t-2 border-ink">
        <div className="mx-auto max-w-6xl px-6 md:px-12 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
          <span>© {new Date().getFullYear()} Novique.ai · LabelWatch</span>
          <span>label.watch · labelwatch.app</span>
        </div>
      </footer>
    </div>
  );
}
