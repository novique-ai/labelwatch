// GET /api/account/export.csv — bead infrastructure-0sco.
// Team-only CSV download of the customer's full match history.
//
// Auth: lw_customer cookie (same pattern as /api/account/channels).
// Tier gate: 403 for starter and pro.
// Optional query params:
//   ?from=YYYY-MM-DD  — filter created_at >= from (inclusive)
//   ?to=YYYY-MM-DD    — filter created_at <= to (end of day UTC)
//
// CSV columns (per bead spec):
//   recall_number, classification, firm_name_raw, product_description,
//   severity_class, matched_value, channel_type, status, sent_at, created_at

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_COOKIE_NAME, decodeCustomerCookie } from "@/lib/customer-session";
import { getSupabase } from "@/lib/supabase";
import { isValidTier } from "@/lib/stripe";
import type { Tier } from "@/types/database.types";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function authCustomerId(): Promise<string | null> {
  const cookieStore = await cookies();
  return decodeCustomerCookie(cookieStore.get(CUSTOMER_COOKIE_NAME)?.value);
}

export async function GET(request: Request) {
  const customerId = await authCustomerId();
  if (!customerId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const supabase = getSupabase();

  const { data: customerRow } = await supabase
    .from("customers")
    .select("tier")
    .eq("id", customerId)
    .maybeSingle<{ tier: string }>();
  if (!customerRow) {
    return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
  }
  const tier: Tier = isValidTier(customerRow.tier) ? customerRow.tier : "starter";
  if (tier !== "team") {
    return NextResponse.json({ error: "team_tier_required" }, { status: 403 });
  }

  // Optional date-range filters on created_at.
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let query = supabase
    .from("delivery_jobs")
    .select(
      "severity_class, matched_value, status, sent_at, created_at, recall:recalls(recall_number, classification, firm_name_raw, product_description), channel:customer_channels!customer_channel_id(type)",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (from && DATE_RE.test(from)) query = query.gte("created_at", from);
  if (to && DATE_RE.test(to)) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  const { data, error } = await query;
  if (error) {
    console.error("/api/account/export.csv query failed:", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  type Row = {
    severity_class: string;
    matched_value: string;
    status: string;
    sent_at: string | null;
    created_at: string;
    recall: { recall_number: string; classification: string | null; firm_name_raw: string; product_description: string | null } | null;
    channel: { type: string } | null;
  };

  const HEADERS = [
    "recall_number",
    "classification",
    "firm_name_raw",
    "product_description",
    "severity_class",
    "matched_value",
    "channel_type",
    "status",
    "sent_at",
    "created_at",
  ];

  const rows = ((data as unknown as Row[]) ?? []).map((r) => [
    r.recall?.recall_number ?? "",
    r.recall?.classification ?? r.severity_class,
    r.recall?.firm_name_raw ?? "",
    r.recall?.product_description ?? "",
    r.severity_class,
    r.matched_value,
    r.channel?.type ?? "",
    r.status,
    r.sent_at ?? "",
    r.created_at,
  ]);

  const csv = [HEADERS, ...rows]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="labelwatch-export.csv"',
      "Cache-Control": "no-store",
    },
  });
}

// RFC 4180: quote any field containing comma, double-quote, CR, or LF.
function cell(v: string): string {
  if (/[,"\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
