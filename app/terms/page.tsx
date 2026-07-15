import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — LabelWatch",
  description:
    "Terms governing use of LabelWatch (Novique.ai LLC), including subscriptions and disclaimers.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-2xl px-6 md:px-12 py-12 md:py-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-3">
          <Link
            href="/"
            className="underline decoration-recall/40 underline-offset-2 hover:decoration-recall"
          >
            ← LabelWatch
          </Link>
        </p>

        <h1 className="font-display text-4xl md:text-5xl leading-tight mb-4">
          Terms of Service
        </h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-10">
          Last updated · July 15, 2026 · Novique.ai LLC
        </p>

        <div className="font-body text-ink leading-relaxed space-y-6 text-[15px]">
          <p>
            By using LabelWatch at label.watch (“Service”), you agree to these
            terms with <strong>Novique.ai LLC</strong> (“LabelWatch”, “we”).
            If you do not agree, do not use the Service.
          </p>

          <h2 className="font-display text-2xl mt-8">The Service</h2>
          <p>
            LabelWatch monitors publicly available FDA enforcement data
            (via openFDA), matches records to customer-configured firm and
            ingredient profiles, and delivers alerts through channels you
            configure. Optional features include Amazon TIC-oriented listing
            checks and team collaboration tools depending on your plan.
          </p>

          <h2 className="font-display text-2xl mt-8">Not legal or compliance advice</h2>
          <p>
            LabelWatch is an information and notification tool. It is{" "}
            <strong>not</strong> legal counsel, regulatory counsel, or a
            guarantee of marketplace compliance. You remain solely responsible
            for product compliance, listings, testing, and decisions you make
            based on alerts or audit output.
          </p>

          <h2 className="font-display text-2xl mt-8">Accounts &amp; access</h2>
          <p>
            You must provide a valid email you control. Account access is
            granted via magic-link email. You are responsible for activity
            under your account and for keeping channel destinations (Slack,
            webhooks, etc.) secured.
          </p>

          <h2 className="font-display text-2xl mt-8">Subscriptions &amp; billing</h2>
          <p>
            Paid plans are billed through Stripe according to the tier you
            select (including any published trial). You may cancel via the
            Stripe customer portal or by contacting support. Fees already
            incurred are generally non-refundable except where required by law
            or explicitly offered by us.
          </p>

          <h2 className="font-display text-2xl mt-8">Acceptable use</h2>
          <p>
            Do not abuse the Service (scraping beyond your plan, attempting to
            bypass rate limits or auth, using the Service to spam, or reverse
            engineering in violation of law). We may suspend accounts that
            threaten the Service or other customers.
          </p>

          <h2 className="font-display text-2xl mt-8">Disclaimer of warranties</h2>
          <p>
            THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” WE DISCLAIM
            WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
            AND NON-INFRINGEMENT TO THE FULLEST EXTENT PERMITTED BY LAW. We do
            not warrant uninterrupted or error-free operation, complete FDA
            coverage, or that every relevant recall will match your profile.
          </p>

          <h2 className="font-display text-2xl mt-8">Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, Novique.ai LLC’s total
            liability arising out of or related to the Service is limited to
            the fees you paid us for the Service in the three (3) months
            before the claim. We are not liable for indirect, incidental,
            special, consequential, or punitive damages, or lost profits,
            revenue, or data.
          </p>

          <h2 className="font-display text-2xl mt-8">FDA data attribution</h2>
          <p>
            Recall content displayed or delivered is sourced from U.S. FDA /
            openFDA publications. We present that information for matching and
            notification; we do not independently investigate or endorse the
            underlying enforcement actions.
          </p>

          <h2 className="font-display text-2xl mt-8">Changes</h2>
          <p>
            We may update these terms by posting a revised version on this
            page. Continued use after changes constitutes acceptance of the
            updated terms.
          </p>

          <h2 className="font-display text-2xl mt-8">Contact</h2>
          <p>
            <a className="underline" href="mailto:support@novique.ai">
              support@novique.ai
            </a>{" "}
            ·{" "}
            <Link href="/contact" className="underline">
              /contact
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
