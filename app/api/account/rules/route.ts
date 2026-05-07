// /api/account/rules — custom alert rule CRUD — bead infrastructure-yo7k.
// POST: create a rule. DELETE ?id=: delete a rule.
// Auth: lw_customer cookie. Tier gate: team only. Must be org owner.
// Limit: max 20 active rules per org.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_COOKIE_NAME, decodeCustomerCookie } from "@/lib/customer-session";
import { getSupabase } from "@/lib/supabase";
import { isValidTier } from "@/lib/stripe";
import type { Tier } from "@/types/database.types";

export const runtime = "nodejs";

const MAX_RULES = 20;
const UUID_RE = /^[0-9a-f-]{36}$/;

async function authCustomerId(): Promise<string | null> {
  const cookieStore = await cookies();
  return decodeCustomerCookie(cookieStore.get(CUSTOMER_COOKIE_NAME)?.value);
}

async function getOwnerOrg(
  supabase: ReturnType<typeof import("@/lib/supabase").getSupabase>,
  customerId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_customer_id", customerId)
    .maybeSingle<{ id: string }>();
  return data ?? null;
}

export async function POST(request: Request) {
  const customerId = await authCustomerId();
  if (!customerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = getSupabase();

  const { data: customerRow } = await supabase
    .from("customers")
    .select("tier")
    .eq("id", customerId)
    .maybeSingle<{ tier: string }>();
  if (!customerRow) return NextResponse.json({ error: "customer_not_found" }, { status: 404 });

  const tier: Tier = isValidTier(customerRow.tier) ? customerRow.tier : "starter";
  if (tier !== "team") return NextResponse.json({ error: "team_tier_required" }, { status: 403 });

  const org = await getOwnerOrg(supabase, customerId);
  if (!org) return NextResponse.json({ error: "org_not_found" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  // Accept keywords as array or comma-separated string.
  let keywords: string[] = [];
  if (Array.isArray(body.keywords)) {
    keywords = (body.keywords as unknown[]).map(String).map((k) => k.trim()).filter(Boolean);
  } else if (typeof body.keywords === "string") {
    keywords = body.keywords.split(",").map((k) => k.trim()).filter(Boolean);
  }
  if (!keywords.length) return NextResponse.json({ error: "keywords_required" }, { status: 400 });

  // Rule cap.
  const { count } = await supabase
    .from("alert_rules")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .eq("enabled", true);
  if ((count ?? 0) >= MAX_RULES) {
    return NextResponse.json({ error: "rules_cap_exceeded", max: MAX_RULES }, { status: 400 });
  }

  const { data: rule, error } = await supabase
    .from("alert_rules")
    .insert({ organization_id: org.id, name, keywords })
    .select("id, organization_id, name, keywords, enabled, created_at")
    .single();
  if (error) {
    console.error("/api/account/rules POST failed:", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rule });
}

export async function DELETE(request: Request) {
  const customerId = await authCustomerId();
  if (!customerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = getSupabase();

  const { data: customerRow } = await supabase
    .from("customers")
    .select("tier")
    .eq("id", customerId)
    .maybeSingle<{ tier: string }>();
  if (!customerRow) return NextResponse.json({ error: "customer_not_found" }, { status: 404 });

  const tier: Tier = isValidTier(customerRow.tier) ? customerRow.tier : "starter";
  if (tier !== "team") return NextResponse.json({ error: "team_tier_required" }, { status: 403 });

  const org = await getOwnerOrg(supabase, customerId);
  if (!org) return NextResponse.json({ error: "org_not_found" }, { status: 400 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const { error, count } = await supabase
    .from("alert_rules")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("organization_id", org.id); // scoped to org — prevents cross-org deletion
  if (error) {
    console.error("/api/account/rules DELETE failed:", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  if (!count) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, deleted: count });
}
