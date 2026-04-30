// /api/cron/deliver — bead infrastructure-vlm7.
// Auth + invocation pattern mirrors app/api/cron/poll/route.ts and
// app/api/cron/match/route.ts. Invoked by UptimeRobot every 1 minute
// (configured separately per ops).

import { NextResponse } from "next/server";
import { runDeliver } from "@/lib/deliver";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handle(request);
}

// UptimeRobot HEAD checks for liveness — accept and return 200 without
// actually running the worker. Mirror of poll/match routes.
export async function HEAD() {
  return new Response(null, { status: 200 });
}

async function handle(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-cron-secret") ?? url.searchParams.get("cron_secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDeliver();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("deliver cron failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
