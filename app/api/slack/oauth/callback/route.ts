// /api/slack/oauth/callback — Slack redirects here after the customer
// authorizes the app and picks an Incoming-Webhook channel. We:
//   1. verify state cookie matches the state param (CSRF + replay guard)
//   2. exchange the code for the incoming_webhook.url
//   3. stash result in lw_slack_oauth cookie (signed)
//   4. redirect back to /onboard?session_id=...&slack_connected=1
//
// Failures redirect back to /onboard with ?slack_error=<reason>.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SLACK_STATE_COOKIE_NAME,
  buildOAuthCookieHeader,
  clearCookieHeader,
  decodeStateCookie,
  encodeOAuthCookie,
  exchangeCodeForWebhook,
} from "@/lib/slack-oauth";

export const runtime = "nodejs";

function origin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.label.watch";
}

function back(sessionId: string | null, error?: string): NextResponse {
  const params = new URLSearchParams();
  if (sessionId) params.set("session_id", sessionId);
  if (error) params.set("slack_error", error);
  else params.set("slack_connected", "1");
  const url = `${origin()}/onboard?${params.toString()}`;
  const resp = NextResponse.redirect(url, 302);
  // Always clear the state cookie — single-use.
  resp.headers.append("Set-Cookie", clearCookieHeader(SLACK_STATE_COOKIE_NAME));
  return resp;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // Read state cookie before any further processing
  const cookieStore = await cookies();
  const stateCookieValue = cookieStore.get(SLACK_STATE_COOKIE_NAME)?.value;
  const decoded = decodeStateCookie(stateCookieValue);
  const sessionId = decoded?.sessionId ?? null;

  if (errorParam) {
    return back(sessionId, errorParam);
  }

  if (!code || !stateParam) {
    return back(sessionId, "missing_code_or_state");
  }

  if (!decoded) {
    return back(null, "state_cookie_invalid");
  }

  if (stateParam !== stateCookieValue) {
    return back(sessionId, "state_mismatch");
  }

  const result = await exchangeCodeForWebhook(code);
  if (!result.ok || !result.incoming_webhook?.url || !result.team?.name) {
    console.error("slack oauth exchange failed:", result.error ?? "unknown");
    return back(sessionId, result.error ?? "exchange_failed");
  }
  if (!sessionId) {
    // Should never happen since we early-return on !decoded above, but
    // narrows the type for the cookie payload below.
    return back(null, "session_lost");
  }

  const oauthCookie = encodeOAuthCookie({
    sessionId,
    webhookUrl: result.incoming_webhook.url,
    channel: result.incoming_webhook.channel,
    teamName: result.team.name,
    configurationUrl: result.incoming_webhook.configuration_url,
  });

  const resp = back(sessionId);
  resp.headers.append("Set-Cookie", buildOAuthCookieHeader(oauthCookie));
  return resp;
}
