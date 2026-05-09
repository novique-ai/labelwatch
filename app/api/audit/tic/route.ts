// POST /api/audit/tic — AI TIC compliance assessment for a supplement listing.
// Bead infrastructure-2e17.
//
// Auth: customer-session cookie.
// Tier gate: Pro+ only (Starter sees the static checklist; AI assessment is Pro+).
// Body: { listing_text: string } (plain text of the Amazon listing).
// Response: TicAssessmentResult JSON (stateless — not persisted in v0.1).
//
// Rate limit: 10 requests per hour per customer (in-memory, resets on function
// cold-start). Prevents abuse without a DB write on every call.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeCustomerCookie, CUSTOMER_COOKIE_NAME } from "@/lib/customer-session";
import { getSupabase } from "@/lib/supabase";
import { isValidTier } from "@/lib/stripe";
import { getRulesForCategories } from "@/lib/amazon-tic-rules";
import { assessListing } from "@/lib/tic-assessment";
import type { IngredientCategory } from "@/types/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_LISTING_CHARS = 40_000;
// In-memory rate limit: customerID → { count, window_start_ms }
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(customerId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(customerId);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(customerId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const customerId = decodeCustomerCookie(cookieStore.get(CUSTOMER_COOKIE_NAME)?.value);
  if (!customerId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("id, tier, onboarding_completed_at")
    .eq("id", customerId)
    .maybeSingle();

  if (customerErr || !customer || !customer.onboarding_completed_at) {
    return NextResponse.json({ error: "customer_not_eligible" }, { status: 403 });
  }

  const tier = isValidTier(customer.tier) ? customer.tier : "starter";
  if (tier === "starter") {
    return NextResponse.json(
      { error: "tier_required", required: "pro", current: "starter" },
      { status: 403 },
    );
  }

  if (!checkRateLimit(customerId)) {
    return NextResponse.json(
      { error: "rate_limit_exceeded", limit: RATE_LIMIT, window_hours: 1 },
      { status: 429 },
    );
  }

  let body: { listing_text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const listingText = typeof body.listing_text === "string" ? body.listing_text.trim() : "";
  if (listingText.length < 20) {
    return NextResponse.json({ error: "listing_text_too_short" }, { status: 400 });
  }
  if (listingText.length > MAX_LISTING_CHARS) {
    return NextResponse.json({ error: "listing_text_too_long" }, { status: 413 });
  }

  // Load customer's ingredient categories to select applicable rules.
  const { data: profile } = await supabase
    .from("customer_profiles")
    .select("ingredient_categories")
    .eq("customer_id", customerId)
    .maybeSingle();

  const categories: IngredientCategory[] = (profile?.ingredient_categories ?? []) as IngredientCategory[];
  const rules = getRulesForCategories(categories.length > 0 ? categories : ["other"]);

  try {
    const result = await assessListing(listingText, rules);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/audit/tic failed:", message);
    return NextResponse.json({ error: "assessment_failed", detail: message }, { status: 500 });
  }
}
