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
import { runCustomerBackfill } from "@/lib/matcher";
import { generateSigningSecret } from "@/lib/adapters/http";
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
    // signing_secret: accept caller-supplied if present and well-formed,
    // otherwise generate (32-byte hex = 64 chars). The HTTP webhook adapter
    // (vlm7) signs each delivery with HMAC-SHA256 using this secret.
    const signingSecret =
      typeof c.signing_secret === "string" && c.signing_secret.length === 64
        ? c.signing_secret
        : generateSigningSecret();
    return {
      type: t,
      config: { url: c.url, auth_header: authHeader, signing_secret: signingSecret },
    };
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

    // Per-customer 180-day backfill (bead infrastructure-xv3f). Run synchronously
    // so the customer sees a consistent state on response. Errors here are
    // logged but do NOT fail the onboarding — the global matcher cron will
    // catch the customer up on its forward cadence (within MATCHER_BACKFILL_DAYS=7
    // for very recent recalls). Skip on re-onboards (alreadyOnboarded=true) since
    // delivery_jobs UNIQUE would no-op anyway.
    let backfillRunId: string | null = null;
    let backfillJobsEmitted = 0;
    if (!alreadyOnboarded) {
      try {
        const result = await runCustomerBackfill(customerId, { supabase });
        if (!result.skipped) {
          backfillRunId = result.runId;
          backfillJobsEmitted = result.jobsEmitted;
        }
      } catch (err) {
        console.error("customer backfill failed (non-fatal):", err);
      }
    }

    // Return signing_secret ONCE on first-time onboard for HTTP channels.
    // Customer must store it; we have no API to retrieve it later (they'd
    // need to /onboard again to rotate). Re-onboards (alreadyOnboarded=true)
    // do NOT echo the secret — even though validateChannel() generated one,
    // the existing channel row's secret is what's actually persisted.
    const signingSecret =
      !alreadyOnboarded && channel.type === "http"
        ? (channel.config as { signing_secret?: string }).signing_secret ?? null
        : null;

    return NextResponse.json({
      ok: true,
      customer_id: customerId,
      already_onboarded: alreadyOnboarded,
      backfill_run_id: backfillRunId,
      backfill_jobs_emitted: backfillJobsEmitted,
      signing_secret: signingSecret,
    });
  } catch (err) {
    console.error("onboard handler failed:", err);
    return NextResponse.json({ error: "onboarding_failed" }, { status: 500 });
  }
}
