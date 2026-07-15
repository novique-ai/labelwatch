// Magic-link sign-in (infra-lodo).
// POST { email } → always 200 { ok: true } (no email enumeration).
// If the email maps to a customer, Resend delivers a 15-minute link to
// GET /api/account/signin/callback?t=... which sets the session cookie.

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { signMagicLinkToken } from "@/lib/magic-link";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";

const GENERIC_OK = { ok: true, status: "check_email" as const };

function normalizePublicBase(url: string): string {
  const u = url.replace(/\/$/, "");
  // Apex always 307s to www; session cookies are host-only, so magic-link
  // targets must be www or the cookie is set on the wrong host.
  if (u === "https://label.watch" || u === "http://label.watch") {
    return "https://www.label.watch";
  }
  return u;
}

function publicBaseUrl(request: Request): string {
  const env =
    process.env.LABELWATCH_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://www.label.watch";
  // Prefer request origin when it is a real public host (www/apex).
  const origin = request.headers.get("origin");
  if (
    origin &&
    (origin.includes("label.watch") || origin.includes("localhost"))
  ) {
    return normalizePublicBase(origin);
  }
  return normalizePublicBase(env);
}

export async function POST(request: Request) {
  let email: string;
  try {
    const body = await request.json();
    email = String(body.email ?? "")
      .trim()
      .toLowerCase();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // Always take the same code path length as much as practical; never
  // reveal whether the email is registered.
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("customers")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (data?.id) {
      const token = signMagicLinkToken(data.id);
      const base = publicBaseUrl(request);
      const link = `${base}/api/account/signin/callback?t=${encodeURIComponent(token)}`;
      const from =
        process.env.CONTACT_EMAIL_FROM ?? "LabelWatch <noreply@label.watch>";
      const result = await sendEmail({
        from,
        to: email,
        subject: "Your LabelWatch sign-in link",
        text: [
          "Sign in to LabelWatch with this one-time link (expires in 15 minutes):",
          "",
          link,
          "",
          "If you did not request this, you can ignore this email.",
          "— LabelWatch",
        ].join("\n"),
      });
      if (!result.ok) {
        console.error("magic-link email failed:", result.error);
        // Still generic — do not leak delivery failure to callers.
      }
    }
  } catch (err) {
    console.error("signin magic-link exception:", err);
  }

  return NextResponse.json(GENERIC_OK);
}
