// /api/slack/oauth/init — kicks off the Slack OAuth dance for a customer
// who selected Slack as their delivery channel during /onboard.
//
// Inputs: ?session_id=cs_live_... (the in-progress Stripe Checkout session
// the customer is onboarding under). We stash session_id into the state
// cookie so the callback can route the result back to the right /onboard
// instance.

import { NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  buildStateCookieHeader,
  encodeStateCookie,
} from "@/lib/slack-oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id") ?? "";
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "invalid_session_id" }, { status: 400 });
  }

  if (!process.env.SLACK_CLIENT_ID) {
    return NextResponse.json(
      { error: "slack_oauth_not_configured" },
      { status: 503 },
    );
  }

  const { value: stateValue } = encodeStateCookie(sessionId);
  const authorizeUrl = buildAuthorizeUrl(stateValue);

  const response = NextResponse.redirect(authorizeUrl, 302);
  response.headers.set("Set-Cookie", buildStateCookieHeader(stateValue));
  return response;
}
