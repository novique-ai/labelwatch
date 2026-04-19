import { NextResponse } from "next/server";
import { getStripe, isValidTier, priceIdForTier } from "@/lib/stripe";

export const runtime = "nodejs";

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

  const origin =
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceIdForTier(tier), quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
      subscription_data: {
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
