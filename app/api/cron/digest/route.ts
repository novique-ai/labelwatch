// /api/cron/digest — bead infrastructure-xzuz.
// Daily digest for Starter-tier customers. Bundles all digest_pending
// delivery_jobs into one message per (customer × channel) and dispatches.
//
// Schedule: Vercel cron 0 9 * * * (09:00 UTC daily). See vercel.json.
//
// Auth: accepts two patterns (this route extends the shared pattern with Bearer):
//   - Vercel cron injects: Authorization: Bearer <CRON_SECRET>
//   - Manual / local smoke: x-cron-secret header or ?cron_secret= query param
//     (shared pattern with /api/cron/match and /api/cron/deliver)

import { NextResponse } from "next/server";
import { runDigest } from "@/lib/digest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handle(request);
}

// HEAD must execute the same path as GET (secret required). No-op HEAD
// 200 masked missing schedules during the 2026-05→07 outage (infra-psc1).
export async function HEAD(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const url = new URL(request.url);
  // Vercel cron: Authorization: Bearer <secret>
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  // Manual / UptimeRobot fallback: header or query param
  const headerOrParam =
    request.headers.get("x-cron-secret") ?? url.searchParams.get("cron_secret");

  const provided = bearerToken ?? headerOrParam;
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDigest();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("digest cron failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
