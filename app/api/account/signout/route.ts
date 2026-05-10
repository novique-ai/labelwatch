import { NextResponse } from "next/server";
import { CUSTOMER_COOKIE_NAME } from "@/lib/customer-session";

export async function POST() {
  const res = NextResponse.redirect(
    new URL("/", process.env.NEXT_PUBLIC_SITE_URL ?? "https://label.watch"),
    { status: 303 },
  );
  res.cookies.set(CUSTOMER_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
