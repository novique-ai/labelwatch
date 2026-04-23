import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabase } from "@/lib/supabase";
import { sendEmail, URGENT_HEADERS } from "@/lib/resend";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CATEGORIES = [
  "general",
  "sales",
  "support",
  "feedback",
  "research",
  "partnership",
  "other",
] as const;

type Category = (typeof CATEGORIES)[number];

const CATEGORY_LABEL: Record<Category, string> = {
  general: "General inquiry",
  sales: "Sales / pricing",
  support: "Support",
  feedback: "Feature request / product feedback",
  research: "Research interview (supplements operator)",
  partnership: "Partnership / press",
  other: "Other",
};

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Honeypot — silently succeed if a bot filled the hidden `website` field.
  if (typeof body.website === "string" && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true, status: "received" });
  }

  const name = String(body.name ?? "").trim().slice(0, 200);
  const email = String(body.email ?? "").trim().toLowerCase();
  const firmRaw = String(body.firm ?? "").trim().slice(0, 200);
  const firm = firmRaw.length > 0 ? firmRaw : null;
  const categoryRaw = String(body.category ?? "").trim().toLowerCase();
  const category = (CATEGORIES as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as Category)
    : null;
  const message = String(body.message ?? "").trim().slice(0, 5000);

  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ error: "message_too_short" }, { status: 400 });
  }

  const ipHash = hashIp(
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  );
  const userAgent = request.headers.get("user-agent")?.slice(0, 256) ?? null;
  const referrer =
    String(body.referrer ?? "").slice(0, 512) ||
    request.headers.get("referer")?.slice(0, 512) ||
    null;

  // 1. Persist to Supabase first so we never lose a message even if Resend fails.
  let messageId: string | null = null;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("contact_messages")
      .insert({
        name,
        email,
        firm,
        category,
        message,
        user_agent: userAgent,
        referrer,
        ip_hash: ipHash,
        email_status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("contact_messages insert failed:", error);
      return NextResponse.json({ error: "storage_failed" }, { status: 500 });
    }
    messageId = data.id as string;
  } catch (e) {
    console.error("contact handler exception (storage):", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  // 2. Fire the notification email. Failures here do not lose the message —
  //    the row is on disk; we just mark email_status=failed for follow-up.
  const to = process.env.CONTACT_EMAIL_TO ?? "support@novique.ai";
  const from = process.env.CONTACT_EMAIL_FROM ?? "LabelWatch <noreply@label.watch>";
  const subject = `LabelWatch Customer Message — ${CATEGORY_LABEL[category]}`;
  const text = [
    `New contact-form submission via label.watch`,
    ``,
    `Category: ${CATEGORY_LABEL[category]}`,
    `Name:     ${name}`,
    `Email:    ${email}`,
    firm ? `Firm:     ${firm}` : null,
    ``,
    `Message:`,
    message,
    ``,
    `--`,
    `Stored as contact_messages.id = ${messageId}`,
    referrer ? `Referrer: ${referrer}` : null,
    userAgent ? `User-Agent: ${userAgent}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await sendEmail({
    from,
    to,
    reply_to: email,
    subject,
    text,
    headers: URGENT_HEADERS,
  });

  // 3. Update the row with delivery outcome (best-effort).
  try {
    const supabase = getSupabase();
    await supabase
      .from("contact_messages")
      .update(
        result.ok
          ? { email_status: "sent" }
          : { email_status: "failed", email_error: result.error.slice(0, 500) },
      )
      .eq("id", messageId);
  } catch (e) {
    console.error("contact_messages status update failed:", e);
  }

  if (!result.ok) {
    console.error("contact email send failed:", result.error);
  }

  // We always return success once the row is persisted — the operator will
  // see failed deliveries in Supabase and can follow up manually.
  return NextResponse.json({ ok: true, status: "received" });
}
