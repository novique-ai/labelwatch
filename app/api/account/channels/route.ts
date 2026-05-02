// /api/account/channels — channel management for already-onboarded customers.
// Bead infrastructure-3mbd.
//
// POST   add a channel (email | http; teams hidden for now; slack handled
//        directly by the OAuth callback to avoid two cookie hops)
// DELETE remove a channel by id, scoped to the cookie-bound customer
//
// Auth: customer-session cookie only. The Stripe-portal magic-link remains
// the source of truth for billing; this is the soft-auth surface for
// preference changes (same trust model as /account itself).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  CUSTOMER_COOKIE_NAME,
  decodeCustomerCookie,
} from "@/lib/customer-session";
import { getSupabase } from "@/lib/supabase";
import {
  addCustomerChannel,
  deleteCustomerChannel,
} from "@/lib/customers";
import { generateSigningSecret } from "@/lib/adapters/http";
import type {
  ChannelConfig,
  ChannelType,
} from "@/types/database.types";

export const runtime = "nodejs";

async function authCustomerId(): Promise<string | null> {
  const cookieStore = await cookies();
  return decodeCustomerCookie(cookieStore.get(CUSTOMER_COOKIE_NAME)?.value);
}

// Validates an *account-time* channel submission. Differs from /api/onboard's
// validateChannel in two ways:
//   1. type=slack is rejected here — the OAuth callback handles slack inserts
//      directly, so the only way to get a slack row is via that flow.
//   2. type=teams is rejected for now (matches launch posture: teams hidden).
function validateAccountChannel(value: unknown): {
  type: ChannelType;
  config: ChannelConfig;
} | null {
  if (!value || typeof value !== "object") return null;
  const { type, config } = value as { type?: unknown; config?: unknown };
  if (typeof type !== "string") return null;
  if (!config || typeof config !== "object") return null;
  const c = config as Record<string, unknown>;

  if (type === "email") {
    if (typeof c.address !== "string") return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.address)) return null;
    return { type, config: { address: c.address } };
  }
  if (type === "http") {
    if (typeof c.url !== "string" || !c.url.startsWith("https://")) return null;
    const authHeader =
      typeof c.auth_header === "string" && c.auth_header.trim().length > 0
        ? c.auth_header.trim()
        : null;
    const signingSecret = generateSigningSecret();
    return {
      type,
      config: { url: c.url, auth_header: authHeader, signing_secret: signingSecret },
    };
  }
  return null;
}

export async function POST(request: Request) {
  const customerId = await authCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const channel = validateAccountChannel(body.channel);
  if (!channel) {
    return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
  }

  try {
    const supabase = getSupabase();
    const { id } = await addCustomerChannel(supabase, customerId, channel);
    // Return the signing secret ONCE for HTTP channels — same pattern as
    // /api/onboard. Caller must surface it to the user immediately.
    const signingSecret =
      channel.type === "http"
        ? (channel.config as { signing_secret?: string }).signing_secret ?? null
        : null;
    return NextResponse.json({ ok: true, id, signing_secret: signingSecret });
  } catch (err) {
    console.error("/api/account/channels POST failed:", err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const customerId = await authCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  try {
    const supabase = getSupabase();
    const { deleted } = await deleteCustomerChannel(supabase, customerId, id);
    if (deleted === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    console.error("/api/account/channels DELETE failed:", err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
