// /onboard — post-Stripe-Checkout profile collection.
// Server Component: reads session_id from the URL (Stripe appends
// {CHECKOUT_SESSION_ID}), retrieves the Checkout Session server-side to prefill
// email + tier + firm_name, hands initial state to the client form.

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { isValidTier } from "@/lib/stripe";
import {
  SLACK_OAUTH_COOKIE_NAME,
  decodeOAuthCookie,
} from "@/lib/slack-oauth";
import OnboardForm from "./onboard-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OnboardSearchParams = {
  session_id?: string | string[];
  slack_connected?: string | string[];
  slack_error?: string | string[];
};

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: Promise<OnboardSearchParams>;
}) {
  const params = await searchParams;
  const sessionId = firstParam(params.session_id);
  const slackError = firstParam(params.slack_error);

  if (!sessionId || !sessionId.startsWith("cs_")) {
    redirect("/?checkout=invalid");
  }

  let email = "";
  let tier: "starter" | "pro" | "team" = "starter";
  let firmName = "";

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    email =
      session.customer_details?.email ?? session.customer_email ?? "";
    const metaTier = (session.metadata?.tier ?? "").toLowerCase();
    if (isValidTier(metaTier)) tier = metaTier;
    firmName = session.customer_details?.name?.trim() ?? "";
  } catch (err) {
    console.error("onboard: session retrieve failed:", err);
    redirect("/?checkout=session_not_found");
  }

  // Read the Slack OAuth cookie (set by /api/slack/oauth/callback) and
  // pass the connected metadata to the form. The form uses presence to
  // switch its UI from "Connect Slack" to "Connected ✓ #channel".
  const cookieStore = await cookies();
  const slackOAuth = decodeOAuthCookie(cookieStore.get(SLACK_OAUTH_COOKIE_NAME)?.value);
  const slackConnection =
    slackOAuth && slackOAuth.sessionId === sessionId
      ? { channel: slackOAuth.channel, teamName: slackOAuth.teamName }
      : null;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <div className="mb-10 flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-2xl tracking-tight text-ink hover:text-ink/70"
          >
            label<span className="text-recall">.</span>watch
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
            Onboarding
          </span>
        </div>

        <header className="mb-10">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight mb-4">
            You&apos;re in. Let&apos;s point the alerts at the right firm.
          </h1>
          <p className="text-ink-muted max-w-prose">
            Three short steps. Nothing routes anywhere until you finish — no
            half-configured alerts, no noise.
          </p>
        </header>

        {slackError && (
          <div className="mb-6 rounded border border-recall/40 bg-recall/10 px-4 py-3 text-sm text-recall">
            Slack connection failed: <code className="font-mono text-xs">{slackError}</code>. You can retry, or pick a different delivery channel.
          </div>
        )}

        <OnboardForm
          sessionId={sessionId}
          initialEmail={email}
          initialFirmName={firmName}
          tier={tier}
          slackConnection={slackConnection}
        />

        <footer className="mt-16 border-t border-rule pt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
          Secure: we re-verify this session with Stripe before writing anything.
        </footer>
      </div>
    </main>
  );
}
