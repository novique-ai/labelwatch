// GET /api/v1/matches — Team REST API (bead infrastructure-2mkx).
// Returns the org owner's matched recall history (delivery_jobs + recalls).
//
// Auth: Authorization: Bearer lw_<key>  (API key, Team only)
// Filters: ?from=YYYY-MM-DD &to=YYYY-MM-DD &severity=I,II,III
// Pagination: ?limit=100 (max 1000) &offset=0
//
// Response: { data: [...], pagination: { total, limit, offset, has_more } }

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { verifyApiKey } from "@/lib/api-key";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEVERITY_ALLOWED = new Set(["Class I", "Class II", "Class III"]);
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

export async function GET(request: Request) {
  // Auth: Bearer API key only (no cookie on this endpoint).
  const authHeader = request.headers.get("authorization");
  const rawKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!rawKey) {
    return NextResponse.json(
      { error: "missing_authorization", hint: "Set Authorization: Bearer lw_<your_api_key>" },
      { status: 401 },
    );
  }

  const supabase = getSupabase();
  const verified = await verifyApiKey(supabase, rawKey);
  if (!verified) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const severityParam = url.searchParams.get("severity"); // "I,II,III" or subset
  const limitParam = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const offsetParam = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const limit = Math.min(isNaN(limitParam) || limitParam < 1 ? DEFAULT_LIMIT : limitParam, MAX_LIMIT);
  const offset = isNaN(offsetParam) || offsetParam < 0 ? 0 : offsetParam;

  // Parse severity filter: accepts "I", "II", "III" (roman numeral form → full class name).
  const severityFilter: string[] = [];
  if (severityParam) {
    for (const part of severityParam.split(",")) {
      const candidate = `Class ${part.trim().toUpperCase()}`;
      if (SEVERITY_ALLOWED.has(candidate)) severityFilter.push(candidate);
    }
  }

  let query = supabase
    .from("delivery_jobs")
    .select(
      "id, severity_class, match_reason, matched_value, status, sent_at, created_at, recall:recalls(recall_number, classification, firm_name_raw, product_description, reason_for_recall, recall_initiation_date), channel:customer_channels!customer_channel_id(type)",
      { count: "exact" },
    )
    .eq("customer_id", verified.ownerCustomerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (from && DATE_RE.test(from)) query = query.gte("created_at", from);
  if (to && DATE_RE.test(to)) query = query.lte("created_at", `${to}T23:59:59.999Z`);
  if (severityFilter.length > 0) query = query.in("severity_class", severityFilter);

  const { data, error, count } = await query;
  if (error) {
    console.error("/api/v1/matches query failed:", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const total = count ?? 0;
  return NextResponse.json(
    {
      data: data ?? [],
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + limit < total,
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
