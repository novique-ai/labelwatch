import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const tier = String(body.tier ?? "starter").toLowerCase();
  const referrer = String(body.referrer ?? "").slice(0, 512) || null;
  const utmSource = String(body.utm_source ?? "").slice(0, 64) || null;
  const utmCampaign = String(body.utm_campaign ?? "").slice(0, 64) || null;

  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("labelwatch_signups").insert({
      email,
      tier_interest: ["starter", "pro", "team"].includes(tier) ? tier : "starter",
      referrer,
      utm_source: utmSource,
      utm_campaign: utmCampaign,
      user_agent: request.headers.get("user-agent")?.slice(0, 256) ?? null,
    });

    if (error) {
      // Unique-constraint violation = already on the list. That's a success path.
      if (error.code === "23505") {
        return NextResponse.json({ ok: true, status: "already_subscribed" });
      }
      console.error("supabase insert failed:", error);
      return NextResponse.json({ error: "storage_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: "subscribed" });
  } catch (e) {
    console.error("signup handler exception:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
