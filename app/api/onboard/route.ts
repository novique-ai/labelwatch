// POST /api/onboard — accepts { session_id, firm_aliases, ingredient_categories,
// severity_preferences, channel } from the /onboard form, re-validates the
// Stripe session server-side (never trusts the customer_id/email from body),
// then writes customer_profiles + customer_channels and stamps
// customers.onboarding_completed_at.
//
// Auth model (MVP1): pure session_id trust. See docs/mvp-roadmap.md MVP1 auth.

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabase } from "@/lib/supabase";
import { finalizeOnboarding, upsertCustomerSkeleton } from "@/lib/customers";
import {
  INGREDIENT_CATEGORIES,
  type ChannelConfig,
  type ChannelType,
  type IngredientCategory,
  type SeverityClass,
  type SeverityPreferences,
} from "@/types/database.types";

export const runtime = "nodejs";

const CHANNEL_TYPES: ChannelType[] = ["slack", "teams", "http", "email"];
const SEVERITY_CLASSES: SeverityClass[] = ["I", "II", "III"];
const ALLOWED_CATEGORIES = new Set<string>(INGREDIENT_CATEGORIES);

function isIngredientCategory(value: unknown): value is IngredientCategory {
  return typeof value === "string" && ALLOWED_CATEGORIES.has(value);
}

function validateChannel(value: unknown): {
  type: ChannelType;
  config: ChannelConfig;
} | null {
  if (!value || typeof value !== "object") return null;
  const { type, config } = value as { type?: unknown; config?: unknown };
  if (typeof type !== "string" || !CHANNEL_TYPES.includes(type as ChannelType)) {
    return null;
  }
  if (!config || typeof config !== "object") return null;

  const t = type as ChannelType;
  const c = config as Record<string, unknown>;

  if (t === "slack" || t === "teams") {
    if (typeof c.webhook_url !== "string" || !c.webhook_url.startsWith("https://")) {
      return null;
    }
    return { type: t, config: { webhook_url: c.webhook_url } };
  }
  if (t === "http") {
    if (typeof c.url !== "string" || !c.url.startsWith("https://")) return null;
    const authHeader =
      typeof c.auth_header === "string" && c.auth_header.trim().length > 0
        ? c.auth_header.trim()
        : null;
    return { type: t, config: { url: c.url, auth_header: authHeader } };
  }
  // email
  if (typeof c.address !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.address)) {
    return null;
  }
  return { type: t, config: { address: c.address } };
}

function validateSeverity(value: unknown): SeverityPreferences | null {
  if (!value || typeof value !== "object") return null;
  const { default_min_class } = value as { default_min_class?: unknown };
  if (
    typeof default_min_class !== "string" ||
    !SEVERITY_CLASSES.includes(default_min_class as SeverityClass)
  ) {
    return null;
  }
  return { default_min_class: default_min_class as SeverityClass };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "invalid_session_id" }, { status: 400 });
  }

  // Re-derive customer identity from Stripe. Never trust body-supplied IDs.
  let session: Stripe.Checkout.Session;
  try {
    const stripe = getStripe();
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error("stripe session retrieve failed:", err);
    return NextResponse.json(
      { error: "session_not_found" },
      { status: 404 },
    );
  }

  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  if (!stripeCustomerId) {
    return NextResponse.json({ error: "no_customer" }, { status: 400 });
  }

  const firmAliasesRaw = Array.isArray(body.firm_aliases) ? body.firm_aliases : [];
  const firmAliases = firmAliasesRaw
    .filter((a): a is string => typeof a === "string")
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && a.length <= 200)
    .slice(0, 50);

  const categoriesRaw = Array.isArray(body.ingredient_categories)
    ? body.ingredient_categories
    : [];
  const ingredientCategories = Array.from(
    new Set(categoriesRaw.filter(isIngredientCategory)),
  );

  const severity = validateSeverity(body.severity_preferences);
  if (!severity) {
    return NextResponse.json(
      { error: "invalid_severity_preferences" },
      { status: 400 },
    );
  }

  const channel = validateChannel(body.channel);
  if (!channel) {
    return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
  }

  try {
    const supabase = getSupabase();

    // Ensure a customer row exists. Webhook should have created one, but if
    // the webhook raced or was mis-delivered, back-fill from the session here.
    // A null return means the session isn't eligible (unpaid, missing email,
    // etc.) — fail loudly rather than silently proceeding to "customer not
    // found" in finalizeOnboarding.
    const skeleton = await upsertCustomerSkeleton(supabase, session);
    if (!skeleton) {
      // Only matters if the webhook also didn't create the row. Re-check.
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("stripe_customer_id", stripeCustomerId)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json(
          { error: "session_not_eligible" },
          { status: 400 },
        );
      }
    }

    const { customerId, alreadyOnboarded } = await finalizeOnboarding(
      supabase,
      stripeCustomerId,
      {
        firmAliases,
        ingredientCategories,
        severityPreferences: severity,
        channel,
      },
    );

    return NextResponse.json({
      ok: true,
      customer_id: customerId,
      already_onboarded: alreadyOnboarded,
    });
  } catch (err) {
    console.error("onboard handler failed:", err);
    return NextResponse.json({ error: "onboarding_failed" }, { status: 500 });
  }
}
