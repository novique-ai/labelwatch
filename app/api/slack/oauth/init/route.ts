// /api/slack/oauth/init — kicks off the Slack OAuth dance.
//
// Two callers (bead infrastructure-3mbd):
//   /onboard:  ?session_id=cs_live_...   (no customer cookie yet)
//   /account:  ?return_to=account        (uses customer-session cookie to bind)
//
// Default return_to is "onboard" for backward-compat with the e1pt flow.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  buildAuthorizeUrl,
  buildStateCookieHeader,
  encodeStateCookie,
  type SlackOAuthReturnTo,
} from "@/lib/slack-oauth";
import {
  CUSTOMER_COOKIE_NAME,
  decodeCustomerCookie,
} from "@/lib/customer-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnToParam = url.searchParams.get("return_to") ?? "onboard";
  if (returnToParam !== "onboard" && returnToParam !== "account") {
    return NextResponse.json({ error: "invalid_return_to" }, { status: 400 });
  }
  const returnTo = returnToParam as SlackOAuthReturnTo;

  if (!process.env.SLACK_CLIENT_ID) {
    return NextResponse.json(
      { error: "slack_oauth_not_configured" },
      { status: 503 },
    );
  }

  let stateValue: string;
  if (returnTo === "onboard") {
    const sessionId = url.searchParams.get("session_id") ?? "";
    if (!sessionId.startsWith("cs_")) {
      return NextResponse.json({ error: "invalid_session_id" }, { status: 400 });
    }
    ({ value: stateValue } = encodeStateCookie({ sessionId, returnTo }));
  } else {
    // /account: bind to the customer cookie. If it's missing/invalid, send
    // them to the soft-signin landing rather than start a doomed OAuth.
    const cookieStore = await cookies();
    const customerId = decodeCustomerCookie(
      cookieStore.get(CUSTOMER_COOKIE_NAME)?.value,
    );
    if (!customerId) {
      return NextResponse.redirect(
        new URL("/?account=signin", url.origin),
        302,
      );
    }
    ({ value: stateValue } = encodeStateCookie({ customerId, returnTo }));
  }

  const authorizeUrl = buildAuthorizeUrl(stateValue);
  const response = NextResponse.redirect(authorizeUrl, 302);
  response.headers.set("Set-Cookie", buildStateCookieHeader(stateValue));
  return response;
}
