// runDeliver — bead infrastructure-vlm7.
// Worker that consumes the delivery_jobs queue. Triggered by /api/cron/deliver.
//
// Flow per run:
//   1. recover_stuck_delivering()    — reset rows stuck >5min back to pending
//   2. claim_pending_delivery_jobs() — atomic FOR UPDATE SKIP LOCKED batch
//   3. bulk-fetch recall + customer_channel for each claimed job
//   4. for each job: rate-limit gate → dispatch → settle (sent / pending+backoff / dead_letter)
//
// Concurrency: the claim function is the only safety net needed. UNIQUE on
// delivery_jobs (recall_id, customer_channel_id) prevents the matcher from
// double-emitting; FOR UPDATE SKIP LOCKED prevents two workers from claiming
// the same job. No advisory lock at the cron-route level (matches xv3f).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import {
  type CustomerChannelRow,
  type DeliveryJobRow,
  type DeliveryOutcome,
  type RecallRow,
} from "@/types/database.types";
import { MAX_ATTEMPTS, nextAttemptAt } from "./adapters/render";
import { slackAdapter } from "./adapters/slack";
import { teamsAdapter } from "./adapters/teams";
import { httpAdapter } from "./adapters/http";
import { emailAdapter } from "./adapters/email";
import { checkRateLimit } from "./rate-limit";
import { fireDlqAlert } from "./dlq-alerts";

type DeliveryAdapter = (
  job: DeliveryJobRow,
  recall: RecallRow,
  channel: CustomerChannelRow,
) => Promise<DeliveryOutcome>;

const ADAPTERS: Record<string, DeliveryAdapter> = {
  slack: slackAdapter,
  teams: teamsAdapter,
  http: httpAdapter,
  email: emailAdapter,
};

const CLAIM_BATCH_SIZE = parseInt(process.env.DELIVER_BATCH_SIZE ?? "50", 10);

export type DeliverResult = {
  recovered: number; // rows reset by recover_stuck_delivering
  claimed: number; // rows pulled by claim_pending_delivery_jobs
  sent: number; // adapter ok=true
  failed: number; // adapter ok=false (transient retry OR non-transient dead_letter)
  deadLettered: number; // subset of failed where status=dead_letter
  deferred: number; // rate-limit kicked back
  durationMs: number;
};

export async function runDeliver(): Promise<DeliverResult> {
  const supabase = getSupabase();
  const startMs = Date.now();

  // 1. Recover any stuck-in-delivering rows.
  const { data: recoveredRaw, error: recoverErr } = await supabase.rpc(
    "recover_stuck_delivering",
  );
  if (recoverErr) {
    throw new Error(`recover_stuck_delivering failed: ${recoverErr.message}`);
  }
  const recovered = typeof recoveredRaw === "number" ? recoveredRaw : 0;

  // 2. Claim a batch of pending jobs.
  const { data: claimedRaw, error: claimErr } = await supabase.rpc(
    "claim_pending_delivery_jobs",
    { p_limit: CLAIM_BATCH_SIZE },
  );
  if (claimErr) {
    throw new Error(`claim_pending_delivery_jobs failed: ${claimErr.message}`);
  }
  const jobs = (claimedRaw ?? []) as DeliveryJobRow[];
  if (jobs.length === 0) {
    return {
      recovered,
      claimed: 0,
      sent: 0,
      failed: 0,
      deadLettered: 0,
      deferred: 0,
      durationMs: Date.now() - startMs,
    };
  }

  // 3. Bulk-fetch recall + customer_channel rows.
  const recallIds = Array.from(new Set(jobs.map((j) => j.recall_id)));
  const channelIds = Array.from(new Set(jobs.map((j) => j.customer_channel_id)));

  const [recallsResp, channelsResp] = await Promise.all([
    supabase.from("recalls").select("*").in("id", recallIds),
    supabase.from("customer_channels").select("*").in("id", channelIds),
  ]);
  if (recallsResp.error) {
    throw new Error(`recalls fetch failed: ${recallsResp.error.message}`);
  }
  if (channelsResp.error) {
    throw new Error(`customer_channels fetch failed: ${channelsResp.error.message}`);
  }
  const recallMap = new Map<string, RecallRow>(
    (recallsResp.data as RecallRow[]).map((r) => [r.id, r]),
  );
  const channelMap = new Map<string, CustomerChannelRow>(
    (channelsResp.data as CustomerChannelRow[]).map((c) => [c.id, c]),
  );

  // 4. Process each job.
  let sent = 0;
  let failed = 0;
  let deadLettered = 0;
  let deferred = 0;

  for (const job of jobs) {
    const recall = recallMap.get(job.recall_id);
    const channel = channelMap.get(job.customer_channel_id);

    // Missing referent (FK CASCADE should have cleaned up; defensive).
    if (!recall || !channel) {
      const r = await settleJob(supabase, job, {
        ok: false,
        error: !recall ? "recall not found" : "customer_channel not found",
        transient: false,
      });
      failed++;
      if (r.deadLettered) deadLettered++;
      continue;
    }

    // Rate-limit gate.
    const rate = await checkRateLimit(supabase, job.customer_id);
    if (rate.limited) {
      // Defer: status back to pending, retry in 1h, decrement attempts
      // since we incremented on claim but didn't actually attempt.
      await supabase
        .from("delivery_jobs")
        .update({
          status: "pending",
          next_attempt_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          attempts: Math.max(job.attempts - 1, 0),
        })
        .eq("id", job.id);
      deferred++;
      continue;
    }

    // Dispatch.
    const adapter = ADAPTERS[channel.type];
    if (!adapter) {
      const r = await settleJob(supabase, job, {
        ok: false,
        error: `unknown channel type: ${channel.type}`,
        transient: false,
      });
      failed++;
      if (r.deadLettered) deadLettered++;
      continue;
    }

    let outcome: DeliveryOutcome;
    try {
      outcome = await adapter(job, recall, channel);
    } catch (err) {
      // Adapters should not throw — they should always return DeliveryOutcome.
      // Defensive catch: treat as transient.
      outcome = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        transient: true,
      };
    }

    const r = await settleJob(supabase, job, outcome);
    if (outcome.ok) {
      sent++;
    } else {
      failed++;
      if (r.deadLettered) deadLettered++;
    }
  }

  return {
    recovered,
    claimed: jobs.length,
    sent,
    failed,
    deadLettered,
    deferred,
    durationMs: Date.now() - startMs,
  };
}

// Update a single job row based on the adapter outcome. Returns whether
// the job was dead-lettered (used to fire DLQ alert).
async function settleJob(
  supabase: SupabaseClient,
  job: DeliveryJobRow,
  outcome: DeliveryOutcome,
): Promise<{ deadLettered: boolean }> {
  if (outcome.ok) {
    await supabase
      .from("delivery_jobs")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", job.id);
    return { deadLettered: false };
  }

  // Failure path. Two cases: dead_letter or schedule retry.
  // job.attempts already includes this attempt (claim function incremented
  // before dispatch). attempts >= MAX_ATTEMPTS means this was the last
  // allowed attempt → dead_letter. Non-transient outcomes also dead_letter
  // immediately.
  const isDead = !outcome.transient || job.attempts >= MAX_ATTEMPTS;

  if (isDead) {
    await supabase
      .from("delivery_jobs")
      .update({
        status: "dead_letter",
        last_error: outcome.error.slice(0, 500),
      })
      .eq("id", job.id);
    // Fire DLQ alert (best-effort, deduped per customer_channel/day).
    await fireDlqAlert(supabase, job, outcome.error);
    return { deadLettered: true };
  }

  // Transient failure with attempts < MAX_ATTEMPTS — schedule retry.
  await supabase
    .from("delivery_jobs")
    .update({
      status: "pending",
      next_attempt_at: nextAttemptAt(job.attempts).toISOString(),
      last_error: outcome.error.slice(0, 500),
    })
    .eq("id", job.id);
  return { deadLettered: false };
}
