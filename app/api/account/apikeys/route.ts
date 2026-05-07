// /api/account/apikeys — API key CRUD — bead infrastructure-2mkx.
// POST: create a new API key (returns plaintext key ONCE).
// DELETE ?id=: revoke a key.
// Auth: lw_customer cookie. Tier gate: team only. Must be org owner.
// Limit: max TEAM_MAX_API_KEYS active keys per org.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_COOKIE_NAME, decodeCustomerCookie } from "@/lib/customer-session";
import { getSupabase } from "@/lib/supabase";
import { isValidTier } from "@/lib/stripe";
import { TEAM_MAX_API_KEYS } from "@/lib/tier-limits";
import { generateApiKey } from "@/lib/api-key";
import type { Tier } from "@/types/database.types";

export const runtime = "nodejs";

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
    .from("customers").select("tier").eq("id", customerId)
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

  // Key cap check.
  const { count } = await supabase
    .from("api_keys").select("id", { count: "exact", head: true })
    .eq("organization_id", org.id).is("revoked_at", null);
  if ((count ?? 0) >= TEAM_MAX_API_KEYS) {
    return NextResponse.json({ error: "api_keys_cap_exceeded", max: TEAM_MAX_API_KEYS }, { status: 400 });
  }

  const { key, hash } = generateApiKey();
  const { data: keyRow, error } = await supabase
    .from("api_keys")
    .insert({ organization_id: org.id, name, key_hash: hash })
    .select("id, name, created_at")
    .single();
  if (error) {
    console.error("/api/account/apikeys POST failed:", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  // Return the plaintext key ONCE — never stored, never retrievable again.
  return NextResponse.json({ ok: true, key, id: keyRow.id, name: keyRow.name, created_at: keyRow.created_at });
}

export async function DELETE(request: Request) {
  const customerId = await authCustomerId();
  if (!customerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = getSupabase();

  const { data: customerRow } = await supabase
    .from("customers").select("tier").eq("id", customerId)
    .maybeSingle<{ tier: string }>();
  if (!customerRow) return NextResponse.json({ error: "customer_not_found" }, { status: 404 });

  const tier: Tier = isValidTier(customerRow.tier) ? customerRow.tier : "starter";
  if (tier !== "team") return NextResponse.json({ error: "team_tier_required" }, { status: 403 });

  const org = await getOwnerOrg(supabase, customerId);
  if (!org) return NextResponse.json({ error: "org_not_found" }, { status: 400 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  // Soft-delete: set revoked_at rather than hard delete (preserves audit trail).
  const { error, count } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("organization_id", org.id)
    .is("revoked_at", null);
  if (error) {
    console.error("/api/account/apikeys DELETE failed:", error);
    return NextResponse.json({ error: "revoke_failed" }, { status: 500 });
  }
  if (!count) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, revoked: id });
}
