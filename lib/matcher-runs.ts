// matcher_runs lifecycle — bead infrastructure-xv3f.
// Mirrors lib/audit-runs.ts (createRunPending → markRunning → completeRun / failRun).
// Adds: getWatermark — the cursor for incremental scanning.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatcherRunRow, MatcherRunStatus } from "@/types/database.types";

const DEFAULT_BACKFILL_DAYS = 7;

// Read MAX(last_processed_first_seen_at) from prior completed runs.
// Falls back to NOW() - INTERVAL '$MATCHER_BACKFILL_DAYS days' (default 7)
// when no completed runs exist (first-ever run).
export async function getWatermark(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("matcher_runs")
    .select("last_processed_first_seen_at")
    .in("status", ["ok", "partial"])
    .not("last_processed_first_seen_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`matcher watermark query failed: ${error.message}`);
  }

  if (data?.last_processed_first_seen_at) {
    return data.last_processed_first_seen_at;
  }

  const days = parseBackfillDays(process.env.MATCHER_BACKFILL_DAYS);
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function parseBackfillDays(raw: string | undefined): number {
  if (!raw) return DEFAULT_BACKFILL_DAYS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return DEFAULT_BACKFILL_DAYS;
  return n;
}

// Insert a matcher_runs row in `running` state. Returns the run id.
// Throws on insert failure (caller swallows + returns 500).
export async function createMatcherRunPending(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase
    .from("matcher_runs")
    .insert({ status: "running" })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`matcher_runs insert failed: ${error?.message ?? "no row"}`);
  }
  return data.id;
}

export type MatcherRunCompletion = {
  status: Extract<MatcherRunStatus, "ok" | "partial">;
  scanned: number;
  matched: number;
  jobsEmitted: number;
  deadLetter: number;
  durationMs: number;
  // The first_seen_at of the last successfully-processed recall in this run.
  // null = nothing was processed (e.g., scanned=0). Watermark not advanced.
  watermark: string | null;
};

export async function completeMatcherRun(
  supabase: SupabaseClient,
  runId: string,
  result: MatcherRunCompletion,
): Promise<void> {
  const { error } = await supabase
    .from("matcher_runs")
    .update({
      status: result.status,
      scanned: result.scanned,
      matched: result.matched,
      jobs_emitted: result.jobsEmitted,
      dead_letter: result.deadLetter,
      duration_ms: result.durationMs,
      last_processed_first_seen_at: result.watermark,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) {
    throw new Error(`matcher_runs complete failed: ${error.message}`);
  }
}

// Best-effort failure write. Same pattern as failRun in audit-runs.ts —
// truncate error message, never re-throw, fire-and-forget.
export async function failMatcherRun(
  supabase: SupabaseClient,
  runId: string,
  message: string,
  partialStats?: Partial<Omit<MatcherRunCompletion, "status">>,
): Promise<void> {
  await supabase
    .from("matcher_runs")
    .update({
      status: "error",
      error_message: message.slice(0, 1000),
      scanned: partialStats?.scanned,
      matched: partialStats?.matched,
      jobs_emitted: partialStats?.jobsEmitted,
      dead_letter: partialStats?.deadLetter,
      duration_ms: partialStats?.durationMs,
      last_processed_first_seen_at: partialStats?.watermark,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

export async function listRecentRuns(
  supabase: SupabaseClient,
  limit = 20,
): Promise<MatcherRunRow[]> {
  const { data, error } = await supabase
    .from("matcher_runs")
    .select(
      "id, started_at, finished_at, status, scanned, matched, jobs_emitted, dead_letter, error_message, duration_ms, last_processed_first_seen_at",
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`matcher_runs list failed: ${error.message}`);
  return (data ?? []) as MatcherRunRow[];
}
