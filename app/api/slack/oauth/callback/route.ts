// /api/slack/oauth/callback — Slack redirects here after the customer
// authorizes the app and picks an Incoming-Webhook channel.
//
// Two return paths (bead infrastructure-3mbd):
//   returnTo === "onboard" (e1pt flow):
//     stash webhook URL in lw_slack_oauth cookie, redirect to
//     /onboard?session_id=...&slack_connected=1
//   returnTo === "account" (3mbd flow):
//     verify customer-session cookie matches state.customerId, insert
//     channel row directly, redirect to /account?slack_added=<channel>

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
import {
  CUSTOMER_COOKIE_NAME,
  decodeCustomerCookie,
} from "@/lib/customer-session";
import { getSupabase } from "@/lib/supabase";
import { addCustomerChannel } from "@/lib/customers";

export const runtime = "nodejs";

function origin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.label.watch";
}

function backToOnboard(sessionId: string | null, error?: string): NextResponse {
  const params = new URLSearchParams();
  if (sessionId) params.set("session_id", sessionId);
  if (error) params.set("slack_error", error);
  else params.set("slack_connected", "1");
  const url = `${origin()}/onboard?${params.toString()}`;
  const resp = NextResponse.redirect(url, 302);
  resp.headers.append("Set-Cookie", clearCookieHeader(SLACK_STATE_COOKIE_NAME));
  return resp;
}

function backToAccount(opts: {
  channel?: string;
  teamName?: string;
  error?: string;
}): NextResponse {
  const params = new URLSearchParams();
  if (opts.error) params.set("slack_error", opts.error);
  else {
    if (opts.channel) params.set("slack_added", opts.channel);
    if (opts.teamName) params.set("slack_team", opts.teamName);
  }
  const url = `${origin()}/account${params.toString() ? `?${params.toString()}` : ""}`;
  const resp = NextResponse.redirect(url, 302);
  resp.headers.append("Set-Cookie", clearCookieHeader(SLACK_STATE_COOKIE_NAME));
  return resp;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const cookieStore = await cookies();
  const stateCookieValue = cookieStore.get(SLACK_STATE_COOKIE_NAME)?.value;
  const decoded = decodeStateCookie(stateCookieValue);

  // If state is invalid we don't know where to send the user — onboard is
  // the safer default since it carries no auth assumption.
  if (!decoded) {
    return backToOnboard(null, "state_cookie_invalid");
  }

  const isAccountFlow = decoded.returnTo === "account";

  if (errorParam) {
    return isAccountFlow
      ? backToAccount({ error: errorParam })
      : backToOnboard(decoded.sessionId, errorParam);
  }
  if (!code || !stateParam) {
    return isAccountFlow
      ? backToAccount({ error: "missing_code_or_state" })
      : backToOnboard(decoded.sessionId, "missing_code_or_state");
  }
  if (stateParam !== stateCookieValue) {
    return isAccountFlow
      ? backToAccount({ error: "state_mismatch" })
      : backToOnboard(decoded.sessionId, "state_mismatch");
  }

  const result = await exchangeCodeForWebhook(code);
  if (!result.ok || !result.incoming_webhook?.url || !result.team?.name) {
    console.error("slack oauth exchange failed:", result.error ?? "unknown");
    return isAccountFlow
      ? backToAccount({ error: result.error ?? "exchange_failed" })
      : backToOnboard(decoded.sessionId, result.error ?? "exchange_failed");
  }

  if (isAccountFlow) {
    if (!decoded.customerId) {
      return backToAccount({ error: "customer_missing" });
    }
    // Re-verify the customer-session cookie still matches the state's bound
    // customerId — defends against the customer signing out (or the cookie
    // being swapped) mid-OAuth.
    const sessionCustomerId = decodeCustomerCookie(
      cookieStore.get(CUSTOMER_COOKIE_NAME)?.value,
    );
    if (!sessionCustomerId || sessionCustomerId !== decoded.customerId) {
      return backToAccount({ error: "session_cookie_mismatch" });
    }
    try {
      const supabase = getSupabase();
      await addCustomerChannel(supabase, decoded.customerId, {
        type: "slack",
        config: { webhook_url: result.incoming_webhook.url },
      });
    } catch (err) {
      console.error("slack oauth: channel insert failed:", err);
      return backToAccount({ error: "channel_insert_failed" });
    }
    return backToAccount({
      channel: result.incoming_webhook.channel,
      teamName: result.team.name,
    });
  }

  // /onboard return path — stash cookie for /api/onboard to consume.
  if (!decoded.sessionId) {
    return backToOnboard(null, "session_lost");
  }
  const oauthCookie = encodeOAuthCookie({
    sessionId: decoded.sessionId,
    webhookUrl: result.incoming_webhook.url,
    channel: result.incoming_webhook.channel,
    teamName: result.team.name,
    configurationUrl: result.incoming_webhook.configuration_url,
  });
  const resp = backToOnboard(decoded.sessionId);
  resp.headers.append("Set-Cookie", buildOAuthCookieHeader(oauthCookie));
  return resp;
}
