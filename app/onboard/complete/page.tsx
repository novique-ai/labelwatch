// /onboard/complete — thank-you page after successful onboarding.
// Conditionally renders the HTTP-webhook signing_secret (passed in via
// search param `signing_secret`) when the customer onboarded an http
// channel. Shown ONCE — there is no API to retrieve a forgotten secret.

import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ signing_secret?: string }>;

export default async function OnboardComplete({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const signingSecret =
    typeof params.signing_secret === "string" && params.signing_secret.length === 64
      ? params.signing_secret
      : null;

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

        {signingSecret && (
          <div className="mt-12 mb-12 text-left bg-ink/5 border border-ink/10 rounded p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-recall mb-3">
              ⚠ Webhook signing secret — save now
            </p>
            <p className="text-ink-muted text-sm mb-4 leading-relaxed">
              Use this to verify the <code className="font-mono text-xs bg-ink/5 px-1">X-LabelWatch-Signature</code> header on incoming webhook deliveries:
            </p>
            <pre className="font-mono text-xs bg-ink text-paper p-4 rounded overflow-x-auto select-all">
{signingSecret}
            </pre>
            <p className="text-ink-muted text-xs mt-4 leading-relaxed">
              <strong>This is shown once.</strong> There&apos;s no API to retrieve it later — if you lose it, re-onboard the channel.
              Verification snippet (Node.js):
            </p>
            <pre className="font-mono text-[11px] bg-ink/5 p-3 mt-3 rounded overflow-x-auto leading-relaxed">
{`const expected = "sha256=" + require("crypto")
  .createHmac("sha256", SECRET)
  .update(rawBody, "utf8")
  .digest("hex");
if (expected !== req.headers["x-labelwatch-signature"]) reject;`}
            </pre>
          </div>
        )}

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
