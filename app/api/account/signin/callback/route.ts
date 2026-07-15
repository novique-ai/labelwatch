// GET /api/account/signin/callback?t=<magic> — complete magic-link login.

import { NextResponse } from "next/server";
import { verifyMagicLinkToken } from "@/lib/magic-link";
import {
  encodeCustomerCookie,
  CUSTOMER_COOKIE_NAME,
  CUSTOMER_COOKIE_MAX_AGE,
} from "@/lib/customer-session";

export const runtime = "nodejs";

function siteBase(): string {
  const raw = (
    process.env.LABELWATCH_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://www.label.watch"
  ).replace(/\/$/, "");
  // Host-only cookies must be set on www (apex always redirects).
  if (raw === "https://label.watch" || raw === "http://label.watch") {
    return "https://www.label.watch";
  }
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const verified = verifyMagicLinkToken(token);
  const base = siteBase();

  if (!verified) {
    return NextResponse.redirect(
      new URL("/?account=signin&error=link_expired", base),
      { status: 303 },
    );
  }

  const cookieValue = encodeCustomerCookie(verified.customerId);
  const secure = process.env.NODE_ENV === "production";
  const cookieHeader = [
    `${CUSTOMER_COOKIE_NAME}=${cookieValue}`,
    "Path=/",
    `Max-Age=${CUSTOMER_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
  ].join("; ");

  const res = NextResponse.redirect(new URL("/account", base), { status: 303 });
  res.headers.set("Set-Cookie", cookieHeader);
  return res;
}
