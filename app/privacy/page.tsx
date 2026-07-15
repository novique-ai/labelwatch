import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — LabelWatch",
  description:
    "How LabelWatch (Novique.ai LLC) collects, uses, and protects customer data.",
};

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-10">
          Last updated · July 15, 2026 · Novique.ai LLC
        </p>

        <div className="font-body text-ink leading-relaxed space-y-6 text-[15px]">
          <p>
            LabelWatch is operated by <strong>Novique.ai LLC</strong> (“we”,
            “us”). This policy describes how we handle information when you use
            label.watch and related services.
          </p>

          <h2 className="font-display text-2xl mt-8">What we collect</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Account data</strong> — email address, firm/brand names,
              ingredient categories, delivery channel configuration (email,
              Slack, Teams, webhook URLs), and Stripe customer identifiers.
            </li>
            <li>
              <strong>Billing data</strong> — processed by Stripe. We do not
              store full card numbers on our servers.
            </li>
            <li>
              <strong>Usage data</strong> — delivery history, audit runs you
              submit, contact-form messages, and basic server logs (IP hash,
              user agent) needed for security and abuse prevention.
            </li>
            <li>
              <strong>Public FDA data</strong> — openFDA enforcement records we
              cache for matching and display. That data originates from the U.S.
              FDA, not from you.
            </li>
          </ul>

          <h2 className="font-display text-2xl mt-8">How we use it</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Provide recall matching, alerts, digests, and audit features.</li>
            <li>Authenticate you (magic-link email) and manage your subscription.</li>
            <li>Respond to support and sales messages.</li>
            <li>Operate, secure, and improve the service.</li>
          </ul>

          <h2 className="font-display text-2xl mt-8">Sharing</h2>
          <p>
            We use subprocessors necessary to run the product (for example
            Stripe for payments, Supabase for database hosting, Resend for
            transactional email, Vercel for hosting, and Slack/Microsoft when you
            connect those channels). We do not sell your personal information.
          </p>

          <h2 className="font-display text-2xl mt-8">Retention</h2>
          <p>
            We retain account and delivery data for as long as your subscription
            is active and as needed for legal, tax, and abuse-prevention
            purposes after cancellation. You may request deletion by emailing{" "}
            <a className="underline" href="mailto:support@novique.ai">
              support@novique.ai
            </a>
            .
          </p>

          <h2 className="font-display text-2xl mt-8">Security</h2>
          <p>
            Access to customer dashboards requires a time-limited magic link
            sent to your account email. Session cookies are HttpOnly. Secrets
            are stored in environment configuration, not in client code.
          </p>

          <h2 className="font-display text-2xl mt-8">Contact</h2>
          <p>
            Privacy questions:{" "}
            <a className="underline" href="mailto:support@novique.ai">
              support@novique.ai
            </a>{" "}
            or{" "}
            <Link href="/contact" className="underline">
              /contact
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
