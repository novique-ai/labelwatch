// Cron endpoint for the openFDA poller.
// Triggered by UptimeRobot (see reference_uptimerobot_scheduler memory).
// Accepts secret via `x-cron-secret` header OR `?cron_secret=` query param
// because UptimeRobot free-tier monitors can't set custom headers.

import { NextRequest, NextResponse } from "next/server";
import { runPoll } from "@/lib/poller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const provided =
    req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("cron_secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPoll();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("poller error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// UptimeRobot's default "HTTP(s)" monitor uses GET, but some configs use HEAD.
export async function HEAD(req: NextRequest) {
  return GET(req);
}
