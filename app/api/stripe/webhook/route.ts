import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { persistSubscriptionEvent } from "@/lib/subscriptions";
import { upsertCustomerSkeleton } from "@/lib/customers";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const RELEVANT_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "webhook_not_configured" },
      { status: 500 },
    );
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("webhook signature verification failed:", message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (!RELEVANT_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  try {
    await persistSubscriptionEvent(event);
  } catch (err) {
    console.error(`persist failed for ${event.id} (${event.type}):`, err);
    return NextResponse.json(
      { error: "persist_failed", event_id: event.id },
      { status: 500 },
    );
  }

  // Provision a skeleton customer row on checkout so /onboard has something
  // to attach a profile to. Failure here is logged but does NOT fail the
  // webhook: the event was already persisted, Stripe shouldn't retry, and
  // /onboard will redirect the buyer back if the row is missing.
  if (event.type === "checkout.session.completed") {
    try {
      const supabase = getSupabase();
      const result = await upsertCustomerSkeleton(
        supabase,
        event.data.object as Stripe.Checkout.Session,
      );
      if (result) {
        console.log(
          `[customer-skeleton] ${result.created ? "created" : "existed"} customer_id=${result.customerId} event_id=${event.id}`,
        );
      } else {
        console.warn(
          `[customer-skeleton] skipped event_id=${event.id} — missing customer/email/tier`,
        );
      }
    } catch (err) {
      console.error(
        `[customer-skeleton] failed for event_id=${event.id}:`,
        err,
      );
    }
  }

  return NextResponse.json({ received: true, event_id: event.id });
}
