import { NextResponse } from "next/server";
import { getStripe, isValidTier, priceIdForTier } from "@/lib/stripe";

export const runtime = "nodejs";

// Resolve the public origin used to build Stripe Checkout success/cancel URLs.
// Production MUST resolve to a real public URL — never to localhost. r7d5 gap #1
// (2026-05-01): a checkout session was created via curl with no Origin header
// against a deployment with no NEXT_PUBLIC_SITE_URL, falling through to
// localhost:3000 — Stripe accepted the bogus URL and the customer's success
// redirect 404'd on their machine.
function resolveOrigin(request: Request): string {
  const headerOrigin = request.headers.get("origin");
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const candidate = headerOrigin ?? envSiteUrl;

  if (process.env.NODE_ENV === "production") {
    if (!candidate) {
      throw new Error("origin_unresolvable_in_production");
    }
    if (
      candidate.startsWith("http://localhost") ||
      candidate.startsWith("http://127.") ||
      candidate.startsWith("http://0.0.0.0")
    ) {
      throw new Error("origin_localhost_in_production");
    }
    return candidate;
  }

  return candidate ?? "http://localhost:3000";
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const tier = typeof body.tier === "string" ? body.tier.toLowerCase() : "";
  if (!isValidTier(tier)) {
    return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
  }

  let origin: string;
  try {
    origin = resolveOrigin(request);
  } catch (err) {
    const code = err instanceof Error ? err.message : "origin_resolution_failed";
    console.error("checkout: origin resolution failed:", code);
    return NextResponse.json({ error: code }, { status: 500 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceIdForTier(tier), quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${origin}/onboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
      subscription_data: {
        trial_period_days: 14,
        metadata: { tier },
      },
      metadata: { tier },
    });

    if (!session.url) {
      return NextResponse.json({ error: "no_checkout_url" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout session create failed:", err);
    const message =
      err instanceof Error && err.message.includes("is not set")
        ? "stripe_not_configured"
        : "checkout_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
