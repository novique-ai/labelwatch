// /api/cron/match — bead infrastructure-xv3f.
// Auth + invocation pattern mirrors app/api/cron/poll/route.ts.
// Invoked by UptimeRobot every 5 minutes (configured separately per ops).

import { NextResponse } from "next/server";
import { runMatcher } from "@/lib/matcher";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handle(request);
}

// UptimeRobot may probe with HEAD. Must run the same worker as GET — a
// no-op HEAD 200 previously let monitors look green while matcher never
// ran (prod gap 2026-05-11 → 2026-07-15, bead infra-psc1).
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
  const provided =
    request.headers.get("x-cron-secret") ?? url.searchParams.get("cron_secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMatcher();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("matcher failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
