// POST /api/onboard — accepts { session_id, firm_aliases, ingredient_categories,
// severity_preferences, channel } from the /onboard form, re-validates the
// Stripe session server-side (never trusts the customer_id/email from body),
// then writes customer_profiles + customer_channels and stamps
// customers.onboarding_completed_at.
//
// Auth model (MVP1): pure session_id trust. See docs/mvp-roadmap.md MVP1 auth.

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isValidTier } from "@/lib/stripe";
import { getSupabase } from "@/lib/supabase";
import { finalizeOnboarding, upsertCustomerSkeleton } from "@/lib/customers";
import { runCustomerBackfill } from "@/lib/matcher";
import { sendOnboardingWelcomeEmail } from "@/lib/onboarding-email";
import { buildSetCookieHeader } from "@/lib/customer-session";
import { cookies } from "next/headers";
import {
  SLACK_OAUTH_COOKIE_NAME,
  clearCookieHeader,
  decodeOAuthCookie,
} from "@/lib/slack-oauth";
import { generateSigningSecret } from "@/lib/adapters/http";
import { checkBrandCap, isChannelTypeAllowed } from "@/lib/tier-limits";
import {
  INGREDIENT_CATEGORIES,
  type ChannelConfig,
  type ChannelType,
  type IngredientCategory,
  type SeverityClass,
  type SeverityPreferences,
  type Tier,
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

  if (t === "slack") {
    // Slack now requires OAuth (bead infrastructure-e1pt). The webhook URL
    // is injected server-side from the lw_slack_oauth cookie set by
    // /api/slack/oauth/callback. Body either carries the magic placeholder
    // (preferred — explicit signal from /onboard form) or omits webhook_url
    // entirely. Manual webhook URLs are no longer accepted via this path.
    return { type: t, config: { webhook_url: "" } };
  }
  if (t === "teams") {
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

  // Per-tier brand-identity cap (firm_name + aliases). Defaults to starter
  // when metadata is missing — most restrictive stance for any unknown tier.
  // Bead infrastructure-0a0x.
  const tierMeta = (session.metadata?.tier ?? "").toLowerCase();
  const tier: Tier = isValidTier(tierMeta) ? tierMeta : "starter";
  const firmName = (session.customer_details?.name ?? "").trim();
  const verdict = checkBrandCap(tier, firmName.length > 0, firmAliases.length);
  if (!verdict.allowed) {
    return NextResponse.json(
      {
        error: "brand_cap_exceeded",
        tier: verdict.tier,
        cap: verdict.cap,
        attempted: verdict.attempted,
      },
      { status: 400 },
    );
  }

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

  // Tier allowlist on channel type. The channel-count cap (gvqx) is trivially
  // satisfied at onboard — this is the customer's first channel — so we only
  // gate on type here. Cap enforcement lives in /api/account/channels +
  // /api/slack/oauth/callback for post-onboard channel additions.
  if (!isChannelTypeAllowed(tier, channel.type)) {
    return NextResponse.json(
      {
        error: "channel_type_not_allowed",
        tier,
        type: channel.type,
      },
      { status: 400 },
    );
  }

  // Slack channels: pull the webhook URL from the OAuth cookie (HttpOnly,
  // signed). Cookie is single-use; we clear it on successful inject.
  // The cookie's sessionId must match the session_id we just verified
  // with Stripe — otherwise someone could attempt to attach a Slack
  // workspace to another customer's onboarding flow.
  let slackOAuthCookieClear = false;
  if (channel.type === "slack") {
    const cookieStore = await cookies();
    const oauth = decodeOAuthCookie(
      cookieStore.get(SLACK_OAUTH_COOKIE_NAME)?.value,
    );
    if (!oauth) {
      return NextResponse.json(
        { error: "slack_oauth_required" },
        { status: 400 },
      );
    }
    if (oauth.sessionId !== sessionId) {
      return NextResponse.json(
        { error: "slack_oauth_session_mismatch" },
        { status: 400 },
      );
    }
    channel.config = { webhook_url: oauth.webhookUrl };
    slackOAuthCookieClear = true;
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

    // Per-customer 180-day backfill (bead infrastructure-xv3f, refined by
    // infrastructure-cwlm 2026-05-01).
    //
    // Runs the matcher across the customer's full backfill window to count
    // matches and update matcher_runs telemetry, but DOES NOT enqueue
    // per-recall delivery_jobs — emitDeliveryJobs=false. The customer
    // receives ONE summary "welcome + N recalls in your last 180 days" email
    // (sendOnboardingWelcomeEmail) instead of N individual recall alerts.
    //
    // Steady-state delivery is unchanged: the global matcher cron continues
    // to emit per-recall delivery_jobs for new recalls published AFTER the
    // customer's onboarding timestamp.
    //
    // Errors here are logged but do NOT fail the onboarding — the customer
    // is already a paying subscriber by this point.
    let backfillRunId: string | null = null;
    let backfillMatched = 0;
    if (!alreadyOnboarded) {
      try {
        const result = await runCustomerBackfill(customerId, {
          supabase,
          emitDeliveryJobs: false,
        });
        if (!result.skipped) {
          backfillRunId = result.runId;
          backfillMatched = result.matched;
        }
      } catch (err) {
        console.error("customer backfill failed (non-fatal):", err);
      }

      // Fire-and-log the welcome email. Failures don't fail onboarding.
      try {
        await sendOnboardingWelcomeEmail({
          to: session.customer_details?.email ?? session.customer_email ?? "",
          firmName: session.customer_details?.name ?? "",
          backfillMatched,
        });
      } catch (err) {
        console.error("welcome email send failed (non-fatal):", err);
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

    // Set the customer-session cookie so /account can identify a returning
    // visitor without a session_id query param. See lib/customer-session.ts
    // for the trust model — this is a soft re-entry pointer, not real auth.
    const response = NextResponse.json({
      ok: true,
      customer_id: customerId,
      already_onboarded: alreadyOnboarded,
      backfill_run_id: backfillRunId,
      backfill_matched: backfillMatched,
      signing_secret: signingSecret,
    });
    response.headers.append("Set-Cookie", buildSetCookieHeader(customerId));
    if (slackOAuthCookieClear) {
      response.headers.append("Set-Cookie", clearCookieHeader(SLACK_OAUTH_COOKIE_NAME));
    }
    return response;
  } catch (err) {
    console.error("onboard handler failed:", err);
    return NextResponse.json({ error: "onboarding_failed" }, { status: 500 });
  }
}
