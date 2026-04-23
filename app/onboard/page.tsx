// /onboard — post-Stripe-Checkout profile collection.
// Server Component: reads session_id from the URL (Stripe appends
// {CHECKOUT_SESSION_ID}), retrieves the Checkout Session server-side to prefill
// email + tier + firm_name, hands initial state to the client form.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { isValidTier } from "@/lib/stripe";
import OnboardForm from "./onboard-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OnboardSearchParams = {
  session_id?: string | string[];
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

        <OnboardForm
          sessionId={sessionId}
          initialEmail={email}
          initialFirmName={firmName}
          tier={tier}
        />

        <footer className="mt-16 border-t border-rule pt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
          Secure: we re-verify this session with Stripe before writing anything.
        </footer>
      </div>
    </main>
  );
}
