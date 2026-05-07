// POST /api/account/invite — bead infrastructure-cin7.
// Send a Team org seat invitation email with an HMAC-signed accept link.
//
// Auth: lw_customer cookie — must be the org owner.
// Tier gate: team only (403 for starter/pro).
// Seat gate: max TEAM_MAX_SEATS active memberships (400 seats_full).
// Body: { email: string }

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_COOKIE_NAME, decodeCustomerCookie } from "@/lib/customer-session";
import { getSupabase } from "@/lib/supabase";
import { isValidTier } from "@/lib/stripe";
import { TEAM_MAX_SEATS } from "@/lib/tier-limits";
import {
  countOrgMembers,
  listPendingInvitations,
} from "@/lib/organizations";
import { signInviteToken } from "@/lib/invite-token";
import { sendEmail } from "@/lib/resend";
import type { Tier } from "@/types/database.types";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authCustomerId(): Promise<string | null> {
  const cookieStore = await cookies();
  return decodeCustomerCookie(cookieStore.get(CUSTOMER_COOKIE_NAME)?.value);
}

function publicUrl(): string {
  return (process.env.LABELWATCH_PUBLIC_URL ?? "https://label.watch").replace(/\/$/, "");
}

function from(): string {
  return process.env.CONTACT_EMAIL_FROM ?? "LabelWatch <noreply@label.watch>";
}

export async function POST(request: Request) {
  const customerId = await authCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const supabase = getSupabase();

  // Tier gate.
  const { data: customerRow } = await supabase
    .from("customers")
    .select("tier")
    .eq("id", customerId)
    .maybeSingle<{ tier: string }>();
  if (!customerRow) {
    return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
  }
  const tier: Tier = isValidTier(customerRow.tier) ? customerRow.tier : "starter";
  if (tier !== "team") {
    return NextResponse.json({ error: "team_tier_required" }, { status: 403 });
  }

  // Must be the org owner to send invites.
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("owner_customer_id", customerId)
    .maybeSingle<{ id: string; name: string }>();
  if (!org) {
    return NextResponse.json({ error: "org_not_found" }, { status: 400 });
  }

  // Parse + validate body.
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // Seat cap check.
  const memberCount = await countOrgMembers(supabase, org.id);
  if (memberCount >= TEAM_MAX_SEATS) {
    return NextResponse.json(
      { error: "seats_full", max: TEAM_MAX_SEATS, current: memberCount },
      { status: 400 },
    );
  }

  // Check no un-expired pending invite for the same org + email.
  const pending = await listPendingInvitations(supabase, org.id);
  if (pending.some((inv) => inv.email === email)) {
    return NextResponse.json({ error: "invite_already_pending" }, { status: 400 });
  }

  // Sign token + persist invitation row.
  let token: string;
  try {
    token = signInviteToken(org.id, email);
  } catch (err) {
    console.error("/api/account/invite: token sign failed", err);
    return NextResponse.json({ error: "token_sign_failed" }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { error: inviteError } = await supabase.from("invitations").insert({
    organization_id: org.id,
    email,
    role: "member",
    token,
    expires_at: expiresAt,
  });
  if (inviteError) {
    console.error("/api/account/invite: insert failed", inviteError);
    return NextResponse.json({ error: "invite_insert_failed" }, { status: 500 });
  }

  // Send invite email.
  const acceptLink = `${publicUrl()}/api/accept-invite?t=${encodeURIComponent(token)}`;
  const result = await sendEmail({
    from: from(),
    to: email,
    subject: `You've been invited to join ${org.name} on LabelWatch`,
    text: `You've been invited to join ${org.name} on LabelWatch.

Click the link below to accept your invitation and access the team dashboard:

${acceptLink}

This link expires in 7 days. If you weren't expecting this invitation, you can ignore this email.

— LabelWatch`,
  });

  if (!result.ok) {
    console.error("/api/account/invite: email send failed", result.error);
    // Invitation row is persisted — the owner can resend manually. Don't fail.
  }

  return NextResponse.json({ ok: true, email });
}
