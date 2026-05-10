// MVP1 sign-in: email lookup → set cookie → redirect to /account.
// Not real auth — any party with a customer's email can access their
// dashboard. Acceptable for MVP1; replace with magic-link post-launch.

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { encodeCustomerCookie, CUSTOMER_COOKIE_NAME, CUSTOMER_COOKIE_MAX_AGE } from "@/lib/customer-session";

export async function POST(request: Request) {
  let email: string;
  try {
    const body = await request.json();
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!data?.id) {
    // Deliberate vagueness — don't confirm whether the email exists.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const cookieValue = encodeCustomerCookie(data.id);
  const secure = process.env.NODE_ENV === "production";
  const cookieHeader = [
    `${CUSTOMER_COOKIE_NAME}=${cookieValue}`,
    "Path=/",
    `Max-Age=${CUSTOMER_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
  ].join("; ");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://label.watch";
  const res = NextResponse.redirect(new URL("/account", siteUrl), { status: 303 });
  res.headers.set("Set-Cookie", cookieHeader);
  return res;
}
