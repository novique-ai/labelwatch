import type Stripe from "stripe";
import { getSupabase } from "./supabase";

type Tier = "starter" | "pro" | "team";

function tierFromMetadata(meta: Stripe.Metadata | null | undefined): Tier | null {
  const value = (meta?.tier ?? "").toLowerCase();
  if (value === "starter" || value === "pro" || value === "team") return value;
  return null;
}

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

type EventRow = {
  stripe_event_id: string;
  event_type: string;
  tier: Tier | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  raw: Stripe.Event;
};

function shapeRow(event: Stripe.Event): EventRow {
  const row: EventRow = {
    stripe_event_id: event.id,
    event_type: event.type,
    tier: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    status: null,
    raw: event,
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      row.tier = tierFromMetadata(session.metadata);
      row.stripe_customer_id =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;
      row.stripe_subscription_id =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;
      row.status = session.payment_status ?? null;
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      row.tier = tierFromMetadata(sub.metadata);
      row.stripe_customer_id =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      row.stripe_subscription_id = sub.id;
      row.status = sub.status;
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      row.stripe_customer_id =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id ?? null;
      // Stripe SDK v22: Invoice.subscription was moved onto line items / parent.
      // Pull from the first subscription-backed line if present; else leave null.
      const line = invoice.lines?.data?.find((l) => l.subscription);
      const lineSub = line?.subscription;
      row.stripe_subscription_id =
        typeof lineSub === "string" ? lineSub : lineSub?.id ?? null;
      row.status = "payment_failed";
      break;
    }
  }

  return row;
}

export async function persistSubscriptionEvent(event: Stripe.Event): Promise<void> {
  const row = shapeRow(event);

  if (!supabaseConfigured()) {
    // Fall-back for local dev / first-boot before shell_corp_recall_subscriptions
    // schema is deployed. We still succeed the webhook so Stripe doesn't retry.
    console.log(
      `[subscription-event] SUPABASE not configured — logging only: ${JSON.stringify(
        {
          event_id: row.stripe_event_id,
          event_type: row.event_type,
          tier: row.tier,
          customer: row.stripe_customer_id,
          subscription: row.stripe_subscription_id,
          status: row.status,
        },
      )}`,
    );
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("labelwatch_subscription_events").insert({
    stripe_event_id: row.stripe_event_id,
    event_type: row.event_type,
    tier: row.tier,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    status: row.status,
    raw: row.raw,
  });

  if (error) {
    if (error.code === "23505") {
      // Duplicate event — Stripe retried. Idempotent success.
      console.log(`[subscription-event] dedup: ${row.stripe_event_id}`);
      return;
    }
    throw new Error(`supabase insert failed: ${error.message}`);
  }
}
