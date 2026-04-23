// /onboard/complete — static thank-you page after successful onboarding.

import Link from "next/link";

export const dynamic = "force-static";

export default function OnboardComplete() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <Link
          href="/"
          className="font-display text-2xl tracking-tight text-ink hover:text-ink/70"
        >
          label<span className="text-recall">.</span>watch
        </Link>

        <h1 className="mt-16 font-display text-4xl md:text-5xl tracking-tight mb-6">
          You&apos;re watching.
        </h1>
        <p className="text-ink-muted max-w-prose mx-auto mb-10">
          We&apos;ll send recalls that match your firm and ingredient scope to
          your configured channel, starting with the next poll.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/"
            className="rounded border border-ink px-6 py-2 font-mono text-[10px] uppercase tracking-[0.2em] hover:bg-ink hover:text-paper"
          >
            Back to site
          </Link>
        </div>
      </div>
    </main>
  );
}
