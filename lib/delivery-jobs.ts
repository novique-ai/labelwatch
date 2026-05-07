// delivery_jobs writes — bead infrastructure-xv3f.
// The matcher emits MatchCandidate[] (pure tuples); this module persists them.
//
// Idempotency: the table has UNIQUE (recall_id, customer_channel_id). On
// conflict, Supabase returns 23505 — we silently skip (matches lib/firms.ts
// race-recovery convention). A re-run of the matcher therefore inserts only
// net-new rows.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchCandidate } from "./match-rules";

export type DeliveryJobInsertResult = {
  attempted: number;
  inserted: number;
  conflicted: number; // duplicates silently skipped (recall × channel already queued)
};

// Bulk-insert candidates one row at a time so a single 23505 doesn't
// poison the rest of the batch. Volumes are small (recalls publish a few
// per week × dozens of customers) so per-row overhead is negligible.
//
// matcherRunId stamps each row's created_by_matcher_run_id for audit trace.
export async function bulkInsertDeliveryJobs(
  supabase: SupabaseClient,
  matcherRunId: string,
  candidates: MatchCandidate[],
): Promise<DeliveryJobInsertResult> {
  let inserted = 0;
  let conflicted = 0;

  for (const c of candidates) {
    const { error } = await supabase.from("delivery_jobs").insert({
      recall_id: c.recallId,
      customer_id: c.customerId,
      customer_channel_id: c.customerChannelId,
      match_reason: c.matchReason,
      matched_value: c.matchedValue,
      severity_class: c.severityClass,
      created_by_matcher_run_id: matcherRunId,
    });
    if (!error) {
      inserted++;
      continue;
    }
    if (error.code === "23505") {
      conflicted++;
      continue;
    }
    throw new Error(
      `delivery_jobs insert failed (recall=${c.recallId} channel=${c.customerChannelId}): ${error.message}`,
    );
  }

  return { attempted: candidates.length, inserted, conflicted };
}

// Bulk-insert Starter-tier match candidates as digest_pending delivery_jobs.
// Same idempotency guarantee as bulkInsertDeliveryJobs (UNIQUE on
// (recall_id, customer_channel_id)): re-running the matcher on the same recall
// for the same customer-channel produces a 23505 conflict, silently skipped.
//
// digest_window_date is set to today's UTC date (YYYY-MM-DD) so the digest
// cron can group by day for observability. The claim function filters by
// next_attempt_at <= now(), which defaults to now() at insert time.
export async function bulkInsertDigestJobs(
  supabase: SupabaseClient,
  matcherRunId: string,
  candidates: MatchCandidate[],
): Promise<DeliveryJobInsertResult> {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' UTC
  let inserted = 0;
  let conflicted = 0;

  for (const c of candidates) {
    const { error } = await supabase.from("delivery_jobs").insert({
      recall_id: c.recallId,
      customer_id: c.customerId,
      customer_channel_id: c.customerChannelId,
      match_reason: c.matchReason,
      matched_value: c.matchedValue,
      severity_class: c.severityClass,
      created_by_matcher_run_id: matcherRunId,
      status: "digest_pending",
      digest_window_date: today,
    });
    if (!error) {
      inserted++;
      continue;
    }
    if (error.code === "23505") {
      conflicted++;
      continue;
    }
    throw new Error(
      `delivery_jobs (digest) insert failed (recall=${c.recallId} channel=${c.customerChannelId}): ${error.message}`,
    );
  }

  return { attempted: candidates.length, inserted, conflicted };
}
