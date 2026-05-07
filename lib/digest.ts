// runDigest — bead infrastructure-xzuz.
// Consumes digest_pending delivery_jobs: claims all eligible rows, groups by
// customer_channel_id, dispatches one multi-recall message per group, settles
// each job row. Triggered once daily at 09:00 UTC by Vercel cron (vercel.json).
//
// Scope: Starter-tier customers only — the only tier that produces
// digest_pending rows (see lib/matcher.ts, bulkInsertDigestJobs).
// Channel types: email + slack only (Starter TIER_ALLOWED_CHANNEL_TYPES).
// Teams/HTTP are Pro+ only — any digest_pending row with those types is a
// logic error → dead_letter immediately.
//
// Settle logic mirrors lib/deliver.ts but uses MAX_DIGEST_ATTEMPTS=3 (lower
// than realtime MAX_ATTEMPTS=5) and resets failed rows to digest_pending
// (not pending) so the realtime deliver cron never picks them up.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerChannelRow, DeliveryJobRow, RecallRow } from "@/types/database.types";
import { getSupabase } from "./supabase";
import {
  buildDigestSlackBody,
  buildDigestEmailHtml,
  buildDigestEmailText,
  nextAttemptAt,
  type DigestRecall,
} from "./adapters/render";
import { sendEmail, URGENT_HEADERS } from "./resend";
import { fireDlqAlert } from "./dlq-alerts";

const MAX_DIGEST_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

export type DigestResult = {
  claimed: number;
  bundles: number;
  sent: number;
  failed: number;
  deadLettered: number;
  durationMs: number;
};

export async function runDigest(): Promise<DigestResult> {
  const supabase = getSupabase();
  const startMs = Date.now();

  // 1. Claim all digest_pending rows whose next_attempt_at is in the past.
  const { data: claimedRaw, error: claimErr } = await supabase.rpc(
    "claim_digest_delivery_jobs",
  );
  if (claimErr) {
    throw new Error(`claim_digest_delivery_jobs failed: ${claimErr.message}`);
  }
  const jobs = (claimedRaw ?? []) as DeliveryJobRow[];

  if (jobs.length === 0) {
    return {
      claimed: 0,
      bundles: 0,
      sent: 0,
      failed: 0,
      deadLettered: 0,
      durationMs: Date.now() - startMs,
    };
  }

  // 2. Bulk-fetch recall + channel rows for the claimed batch.
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

  // 3. Group jobs by customer_channel_id to form per-channel bundles.
  const byChannel = new Map<string, DeliveryJobRow[]>();
  for (const job of jobs) {
    const list = byChannel.get(job.customer_channel_id) ?? [];
    list.push(job);
    byChannel.set(job.customer_channel_id, list);
  }

  let bundles = 0;
  let sent = 0;
  let failed = 0;
  let deadLettered = 0;

  // 4. Dispatch one message per channel bundle.
  for (const [channelId, channelJobs] of byChannel) {
    bundles++;
    const channel = channelMap.get(channelId);

    if (!channel) {
      // Channel was deleted after the job was queued (FK CASCADE should have
      // cleaned these up, but defend anyway).
      for (const job of channelJobs) {
        await settleDigestJob(supabase, job, {
          ok: false,
          error: "customer_channel not found",
          transient: false,
        });
        failed++;
        deadLettered++;
      }
      continue;
    }

    // Build DigestRecall items; dead-letter any job whose recall is missing.
    const items: DigestRecall[] = [];
    for (const job of channelJobs) {
      const recall = recallMap.get(job.recall_id);
      if (!recall) {
        await settleDigestJob(supabase, job, {
          ok: false,
          error: "recall not found",
          transient: false,
        });
        failed++;
        deadLettered++;
      } else {
        items.push({ job, recall });
      }
    }
    if (items.length === 0) continue;

    // Dispatch to channel adapter.
    type Outcome = { ok: true } | { ok: false; error: string; transient: boolean };
    let outcome: Outcome;

    if (channel.type === "slack") {
      outcome = await dispatchDigestSlack(channel, items);
    } else if (channel.type === "email") {
      outcome = await dispatchDigestEmail(channel, items);
    } else {
      // teams/http are Pro+ only — should be unreachable in practice.
      outcome = {
        ok: false,
        error: `digest not supported for channel type: ${channel.type}`,
        transient: false,
      };
    }

    // Settle all jobs in the bundle with the same outcome (one send = one result).
    for (const { job } of items) {
      const r = await settleDigestJob(supabase, job, outcome);
      if (outcome.ok) {
        sent++;
      } else {
        failed++;
        if (r.deadLettered) deadLettered++;
      }
    }
  }

  return {
    claimed: jobs.length,
    bundles,
    sent,
    failed,
    deadLettered,
    durationMs: Date.now() - startMs,
  };
}

// -- channel dispatchers -------------------------------------------------------

async function dispatchDigestSlack(
  channel: CustomerChannelRow,
  items: DigestRecall[],
): Promise<{ ok: true } | { ok: false; error: string; transient: boolean }> {
  const cfg = channel.config as { webhook_url?: string };
  if (!cfg?.webhook_url || !cfg.webhook_url.startsWith("https://")) {
    return { ok: false, error: "slack channel has no valid webhook_url", transient: false };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(cfg.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDigestSlackBody(items)),
      signal: controller.signal,
    });
    if (resp.ok) return { ok: true };
    const isFatal = resp.status === 401 || resp.status === 403 || resp.status === 404;
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `slack ${resp.status}: ${text.slice(0, 200)}`,
      transient: !isFatal,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      transient: true,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function dispatchDigestEmail(
  channel: CustomerChannelRow,
  items: DigestRecall[],
): Promise<{ ok: true } | { ok: false; error: string; transient: boolean }> {
  const cfg = channel.config as { address?: string };
  if (!cfg?.address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.address)) {
    return { ok: false, error: "email channel has no valid address", transient: false };
  }

  const date = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const subject = `FDA Recall Digest — ${items.length} match${items.length === 1 ? "" : "es"} · ${date}`;
  const hasClassI = items.some((i) => i.recall.classification === "Class I");

  let result: { ok: true; id: string } | { ok: false; error: string };
  try {
    result = await sendEmail({
      from: "LabelWatch <alerts@label.watch>",
      to: cfg.address,
      subject,
      text: buildDigestEmailText(items),
      html: buildDigestEmailHtml(items),
      headers: hasClassI ? URGENT_HEADERS : undefined,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      transient: true,
    };
  }

  if (!result.ok) return { ok: false, error: result.error, transient: true };
  return { ok: true };
}

// -- settle -------------------------------------------------------------------

async function settleDigestJob(
  supabase: SupabaseClient,
  job: DeliveryJobRow,
  outcome: { ok: true } | { ok: false; error: string; transient: boolean },
): Promise<{ deadLettered: boolean }> {
  if (outcome.ok) {
    await supabase
      .from("delivery_jobs")
      .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
      .eq("id", job.id);
    return { deadLettered: false };
  }

  // job.attempts was already incremented by claim_digest_delivery_jobs().
  const isDead = !outcome.transient || job.attempts >= MAX_DIGEST_ATTEMPTS;

  if (isDead) {
    await supabase
      .from("delivery_jobs")
      .update({ status: "dead_letter", last_error: outcome.error.slice(0, 500) })
      .eq("id", job.id);
    await fireDlqAlert(supabase, job, outcome.error);
    return { deadLettered: true };
  }

  // Transient failure — reset to digest_pending (NOT pending) so the realtime
  // deliver cron never claims it. nextAttemptAt provides exponential backoff.
  await supabase
    .from("delivery_jobs")
    .update({
      status: "digest_pending",
      next_attempt_at: nextAttemptAt(job.attempts).toISOString(),
      last_error: outcome.error.slice(0, 500),
    })
    .eq("id", job.id);
  return { deadLettered: false };
}
