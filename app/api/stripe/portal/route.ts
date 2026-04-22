import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  if (!sessionId) {
    return NextResponse.json({ error: "missing_session_id" }, { status: 400 });
  }

  const origin =
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.status !== "complete") {
      return NextResponse.json(
        { error: "session_not_complete" },
        { status: 400 },
      );
    }

    const customer =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;
    if (!customer) {
      return NextResponse.json(
        { error: "no_customer_on_session" },
        { status: 400 },
      );
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer,
      return_url: origin,
    });

    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error("portal session create failed:", err);
    const message =
      err instanceof Error && err.message.includes("is not set")
        ? "stripe_not_configured"
        : "portal_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
