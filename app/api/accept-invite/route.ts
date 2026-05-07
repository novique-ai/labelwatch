// GET /api/accept-invite?t=<token> — bead infrastructure-cin7.
// Validates an invite token, creates a slim member customers row and
// membership row, sets the lw_customer cookie, then redirects to /account.
//
// On invalid/expired token: redirects to /?invite=invalid.
// On already-accepted token: redirects to /account (idempotent).

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { verifyInviteToken } from "@/lib/invite-token";
import {
  countOrgMembers,
  createMemberCustomer,
  TEAM_MAX_SEATS,
} from "@/lib/organizations";
import { buildSetCookieHeader } from "@/lib/customer-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");

  const verified = verifyInviteToken(token);
  if (!verified) {
    return NextResponse.redirect(new URL("/?invite=invalid", url.origin));
  }
  const { orgId, email } = verified;

  const supabase = getSupabase();

  // Look up the invitation row to confirm it hasn't been accepted and still
  // exists (token could be valid HMAC but the invite row may have been revoked).
  const { data: invitation } = await supabase
    .from("invitations")
    .select("id, accepted_at, organization_id")
    .eq("token", token as string)
    .maybeSingle<{ id: string; accepted_at: string | null; organization_id: string }>();

  if (!invitation) {
    return NextResponse.redirect(new URL("/?invite=invalid", url.origin));
  }

  // Already accepted — re-accept is a no-op but we still need to set a cookie.
  // Find the member's existing customers row by org + email.
  if (invitation.accepted_at) {
    const { data: existingMember } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("email", email)
      .maybeSingle<{ id: string }>();

    if (existingMember) {
      const cookieHeader = buildSetCookieHeader(existingMember.id);
      return NextResponse.redirect(new URL("/account", url.origin), {
        headers: { "Set-Cookie": cookieHeader },
      });
    }
    // Member row was deleted after acceptance — can't restore session.
    return NextResponse.redirect(new URL("/?invite=error", url.origin));
  }

  // Seat cap check (re-check server-side).
  const memberCount = await countOrgMembers(supabase, orgId);
  if (memberCount >= TEAM_MAX_SEATS) {
    return NextResponse.redirect(new URL("/?invite=seats_full", url.origin));
  }

  // Create member customers row + membership row.
  let memberId: string;
  try {
    memberId = await createMemberCustomer(supabase, email, orgId);

    const { error: membershipError } = await supabase.from("memberships").insert({
      organization_id: orgId,
      customer_id: memberId,
      role: "member",
    });
    if (membershipError && membershipError.code !== "23505") {
      throw new Error(`membership insert failed: ${membershipError.message}`);
    }

    // Mark invitation accepted.
    await supabase
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);
  } catch (err) {
    console.error("/api/accept-invite: member provisioning failed", err);
    return NextResponse.redirect(new URL("/?invite=error", url.origin));
  }

  const cookieHeader = buildSetCookieHeader(memberId);
  return NextResponse.redirect(new URL("/account?joined_org=1", url.origin), {
    headers: { "Set-Cookie": cookieHeader },
  });
}
