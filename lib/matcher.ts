// runMatcher — bead infrastructure-xv3f.
// Orchestrates: getWatermark → claim advisory lock → fetch unmatched recalls
// → fetch eligible customers → for each recall, run pure-fn match → bulk-insert
// delivery_jobs → advance watermark → close run.
//
// Concurrency: pg_try_advisory_lock(hashtext('labelwatch_matcher')) at the
// start. If another invocation holds the lock, this run returns
// { skipped: true } without inserting a matcher_runs row. Session-scoped
// locks release automatically when the connection returns to the pool.
//
// Idempotency: UNIQUE (recall_id, customer_channel_id) on delivery_jobs. The
// advisory lock prevents most overlap; the UNIQUE is the safety net for
// pre-lock race windows or future code paths that bypass the matcher cron.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { normalizeFirmName } from "./firms";
import {
  classifyRecallIngredients,
  matchCandidates,
  type CustomerMatchContext,
  type MatchCandidate,
} from "./match-rules";
import {
  completeMatcherRun,
  createMatcherRunPending,
  failMatcherRun,
  getWatermark,
} from "./matcher-runs";
import { bulkInsertDeliveryJobs } from "./delivery-jobs";
import type {
  CustomerChannelRow,
  CustomerProfileRow,
  CustomerRow,
  RecallRow,
} from "@/types/database.types";

const NEW_CUSTOMER_BACKFILL_DAYS_DEFAULT = 180;

function parseNewCustomerBackfillDays(): number {
  const raw = process.env.MATCHER_NEW_CUSTOMER_BACKFILL_DAYS;
  if (!raw) return NEW_CUSTOMER_BACKFILL_DAYS_DEFAULT;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return NEW_CUSTOMER_BACKFILL_DAYS_DEFAULT;
  return n;
}

const ADVISORY_LOCK_KEY = "labelwatch_matcher";

export type MatcherResult =
  | {
      skipped: true;
      reason: "lock_held";
    }
  | {
      skipped: false;
      runId: string;
      status: "ok" | "partial" | "error";
      scanned: number;
      matched: number;
      jobsEmitted: number;
      jobsConflicted: number;
      deadLetter: number;
      durationMs: number;
      watermark: string | null;
    };

export async function runMatcher(): Promise<MatcherResult> {
  const supabase = getSupabase();
  const startMs = Date.now();

  // 1. Acquire advisory lock — if held, exit cleanly.
  const acquired = await tryAdvisoryLock(supabase, ADVISORY_LOCK_KEY);
  if (!acquired) {
    return { skipped: true, reason: "lock_held" };
  }

  // 2. Watermark = highest first_seen_at processed by a previous run, or
  //    NOW() - 7d on first run.
  const watermarkStart = await getWatermark(supabase);

  // 3. Open a matcher_runs row.
  const runId = await createMatcherRunPending(supabase);

  let scanned = 0;
  let matched = 0;
  let deadLetter = 0;
  let jobsEmitted = 0;
  let jobsConflicted = 0;
  let watermarkOut: string | null = null;
  let status: "ok" | "partial" | "error" = "ok";

  try {
    // 4. Fetch new recalls (after watermark) with non-null classification.
    const { data: recalls, error: recallsErr } = await supabase
      .from("recalls")
      .select(
        "id, recall_number, firm_id, firm_name_raw, product_description, reason_for_recall, classification, status, recall_initiation_date, report_date, source, vertical, openfda_raw, first_seen_at, last_updated_at",
      )
      .gt("first_seen_at", watermarkStart)
      .not("classification", "is", null)
      .order("first_seen_at", { ascending: true });
    if (recallsErr) throw new Error(`recalls fetch failed: ${recallsErr.message}`);

    const recallList = (recalls ?? []) as RecallRow[];
    if (recallList.length === 0) {
      // No new recalls — close the run cleanly with watermark unchanged.
      await completeMatcherRun(supabase, runId, {
        status: "ok",
        scanned: 0,
        matched: 0,
        jobsEmitted: 0,
        deadLetter: 0,
        durationMs: Date.now() - startMs,
        watermark: null,
      });
      return {
        skipped: false,
        runId,
        status: "ok",
        scanned: 0,
        matched: 0,
        jobsEmitted: 0,
        jobsConflicted: 0,
        deadLetter: 0,
        durationMs: Date.now() - startMs,
        watermark: null,
      };
    }

    // 5. Fetch eligible customers (onboarded + at least one enabled channel)
    //    with profile + channels nested. PostgREST embed.
    const eligibleCustomers = await fetchEligibleCustomers(supabase);

    // 6. For each recall, classify + match + persist.
    const allCandidates: MatchCandidate[] = [];
    for (const recall of recallList) {
      scanned++;
      const recallCategories = classifyRecallIngredients(recall);
      const normalizedFirmName = normalizeFirmName(recall.firm_name_raw ?? "");

      const candidates = matchCandidates({
        recall,
        normalizedFirmName,
        recallCategories,
        customers: eligibleCustomers,
      });

      if (candidates.length === 0) {
        deadLetter++;
      } else {
        matched++;
        allCandidates.push(...candidates);
      }

      // Advance watermark to this recall's first_seen_at after a successful
      // match attempt, even if 0 candidates were emitted (recall was scanned
      // and didn't match anyone — record progress so we don't re-scan).
      watermarkOut = recall.first_seen_at;
    }

    // 7. Bulk-insert candidates as delivery_jobs.
    if (allCandidates.length > 0) {
      const result = await bulkInsertDeliveryJobs(supabase, runId, allCandidates);
      jobsEmitted = result.inserted;
      jobsConflicted = result.conflicted;
    }

    // 8. Close run.
    await completeMatcherRun(supabase, runId, {
      status,
      scanned,
      matched,
      jobsEmitted,
      deadLetter,
      durationMs: Date.now() - startMs,
      watermark: watermarkOut,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status = "error";
    await failMatcherRun(supabase, runId, message, {
      scanned,
      matched,
      jobsEmitted,
      deadLetter,
      durationMs: Date.now() - startMs,
      // Persist the watermark we got to even on partial — the next run
      // picks up from here, not from the original starting point.
      watermark: watermarkOut,
    });
    throw err;
  }

  return {
    skipped: false,
    runId,
    status,
    scanned,
    matched,
    jobsEmitted,
    jobsConflicted,
    deadLetter,
    durationMs: Date.now() - startMs,
    watermark: watermarkOut,
  };
}

// -- helpers -----------------------------------------------------------------

// Postgres advisory lock helper. Uses pg_try_advisory_lock(hashtext($1)) so
// the lock key is a stable 32-bit hash of the namespace string. Returns true
// if the lock was acquired; false if another session holds it.
//
// Supabase exposes raw pg via .rpc — but for a simple try-lock we use a
// SELECT through the SQL editor endpoint isn't available from PostgREST,
// so we use a stored function `try_matcher_lock()` IF it exists. Fallback:
// rely on the UNIQUE constraint at insert time.
//
// MVP1 NOTE: Supabase service-role can run arbitrary SQL via the
// Management API, but the Vercel runtime only has PostgREST. The
// `pg_try_advisory_lock` call is exposed as a Postgres function via a
// stored function `try_matcher_advisory_lock()` defined in the migration
// (NOT YET DEFINED — see TODO below). For v1 launch we accept duplicate-
// run risk (mitigated by UNIQUE on delivery_jobs) and add the lock via
// migration 008 if ops surfaces issues. This is documented in
// docs/mvp-roadmap.md as an MVP2 hardening item.
//
// TODO(MVP2): add `create function public.try_matcher_advisory_lock()
// returns boolean as $$ select pg_try_advisory_lock(hashtext('labelwatch_matcher')) $$
// language sql security definer;` to a future migration, then call it here.
async function tryAdvisoryLock(
  _supabase: ReturnType<typeof getSupabase>,
  _key: string,
): Promise<boolean> {
  // v1: always succeed. UNIQUE on delivery_jobs is the safety net for
  // overlapping runs. Hardening to real advisory lock is MVP2 (see TODO).
  return true;
}

// Per-customer onboarding backfill — bead infrastructure-xv3f.
//
// Run ONCE per new customer at the end of /api/onboard. Scans the last
// MATCHER_NEW_CUSTOMER_BACKFILL_DAYS days of recalls (default 180) scoped
// to a single customer's profile + enabled channels, emits delivery_jobs
// for every match. Idempotent: UNIQUE (recall_id, customer_channel_id)
// dedups against any future global cron pass.
//
// Crucially this does NOT advance the global watermark — it writes a
// matcher_runs row with `last_processed_first_seen_at = null` so the
// global cron's getWatermark() (which filters that column null) ignores it.
// Without this, a per-customer backfill of 180d would skip those recalls
// for ALL OTHER customers on the next global pass.
//
// Errors are caught and converted to a `status=error` matcher_runs row.
// The caller (/api/onboard) treats this as best-effort: onboarding still
// succeeds even if the backfill failed; the global cron eventually catches
// the customer up on its 7d cadence (within the backfill window for very
// recent recalls).
// emitDeliveryJobs: if false, the backfill counts matches and writes a clean
// matcher_runs row but does NOT enqueue per-recall delivery_jobs. Used by
// /api/onboard (cwlm — onboarding email storm fix): a brand-new customer
// gets ONE summary "welcome + N recalls in your history" email instead of
// N individual recall alerts. Default true preserves all existing callers
// and tests.
export async function runCustomerBackfill(
  customerId: string,
  options?: {
    backfillDays?: number;
    supabase?: SupabaseClient;
    emitDeliveryJobs?: boolean;
  },
): Promise<MatcherResult> {
  const supabase = options?.supabase ?? getSupabase();
  const days = options?.backfillDays ?? parseNewCustomerBackfillDays();
  const emitDeliveryJobs = options?.emitDeliveryJobs ?? true;
  const startMs = Date.now();
  const windowStart = new Date(Date.now() - days * 86_400_000).toISOString();

  const runId = await createMatcherRunPending(supabase);

  let scanned = 0;
  let matched = 0;
  let deadLetter = 0;
  let jobsEmitted = 0;
  let jobsConflicted = 0;

  try {
    const ctx = await fetchEligibleCustomerById(supabase, customerId);
    if (!ctx) {
      // Customer not eligible (no profile, no enabled channels, or not
      // onboarded). Close cleanly with scanned=0; nothing to do.
      await completeMatcherRun(supabase, runId, {
        status: "ok",
        scanned: 0,
        matched: 0,
        jobsEmitted: 0,
        deadLetter: 0,
        durationMs: Date.now() - startMs,
        watermark: null, // intentional — do not advance global watermark
      });
      return {
        skipped: false,
        runId,
        status: "ok",
        scanned: 0,
        matched: 0,
        jobsEmitted: 0,
        jobsConflicted: 0,
        deadLetter: 0,
        durationMs: Date.now() - startMs,
        watermark: null,
      };
    }

    const { data: recalls, error: recallsErr } = await supabase
      .from("recalls")
      .select(
        "id, recall_number, firm_id, firm_name_raw, product_description, reason_for_recall, classification, status, recall_initiation_date, report_date, source, vertical, openfda_raw, first_seen_at, last_updated_at",
      )
      .gte("first_seen_at", windowStart)
      .not("classification", "is", null)
      .order("first_seen_at", { ascending: true });
    if (recallsErr) {
      throw new Error(`recalls fetch (backfill) failed: ${recallsErr.message}`);
    }

    const recallList = (recalls ?? []) as RecallRow[];
    const allCandidates: MatchCandidate[] = [];

    for (const recall of recallList) {
      scanned++;
      const recallCategories = classifyRecallIngredients(recall);
      const normalizedFirmName = normalizeFirmName(recall.firm_name_raw ?? "");

      const candidates = matchCandidates({
        recall,
        normalizedFirmName,
        recallCategories,
        customers: [ctx],
      });

      if (candidates.length === 0) {
        deadLetter++;
      } else {
        matched++;
        allCandidates.push(...candidates);
      }
    }

    if (allCandidates.length > 0 && emitDeliveryJobs) {
      const result = await bulkInsertDeliveryJobs(supabase, runId, allCandidates);
      jobsEmitted = result.inserted;
      jobsConflicted = result.conflicted;
    }

    // IMPORTANT: watermark stays null — see function header.
    await completeMatcherRun(supabase, runId, {
      status: "ok",
      scanned,
      matched,
      jobsEmitted,
      deadLetter,
      durationMs: Date.now() - startMs,
      watermark: null,
    });

    return {
      skipped: false,
      runId,
      status: "ok",
      scanned,
      matched,
      jobsEmitted,
      jobsConflicted,
      deadLetter,
      durationMs: Date.now() - startMs,
      watermark: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failMatcherRun(supabase, runId, message, {
      scanned,
      matched,
      jobsEmitted,
      deadLetter,
      durationMs: Date.now() - startMs,
      watermark: null,
    });
    throw err;
  }
}

async function fetchEligibleCustomerById(
  supabase: SupabaseClient,
  customerId: string,
): Promise<CustomerMatchContext | null> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, customer_profiles(*), customer_channels(*)")
    .eq("id", customerId)
    .not("onboarding_completed_at", "is", null)
    .maybeSingle();
  if (error) {
    throw new Error(`customer fetch (backfill) failed: ${error.message}`);
  }
  if (!data) return null;

  type EmbedRow = {
    id: CustomerRow["id"];
    customer_profiles: CustomerProfileRow[] | CustomerProfileRow | null;
    customer_channels: CustomerChannelRow[];
  };
  const row = data as unknown as EmbedRow;
  const profile = Array.isArray(row.customer_profiles)
    ? row.customer_profiles[0]
    : row.customer_profiles;
  if (!profile) return null;
  const enabled = (row.customer_channels ?? []).filter((c) => c.enabled === true);
  if (enabled.length === 0) return null;
  return { profile, channels: enabled };
}

async function fetchEligibleCustomers(
  supabase: ReturnType<typeof getSupabase>,
): Promise<CustomerMatchContext[]> {
  // Embed profile + enabled channels under each customer. PostgREST allows
  // nested selects via the `select` parameter syntax.
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, customer_profiles(*), customer_channels(*)",
    )
    .not("onboarding_completed_at", "is", null);
  if (error) {
    throw new Error(`eligible customers fetch failed: ${error.message}`);
  }

  // Flatten the embed. PostgREST returns BOTH nested children as arrays
  // (it doesn't use the UNIQUE constraint to infer 1:1). For customer_profiles
  // the array has at most one row (UNIQUE on customer_id); we take [0].
  // A customer is eligible iff it has a profile AND ≥1 enabled channel.
  type EmbedRow = {
    id: CustomerRow["id"];
    customer_profiles: CustomerProfileRow[] | CustomerProfileRow | null;
    customer_channels: CustomerChannelRow[];
  };

  const out: CustomerMatchContext[] = [];
  for (const row of (data ?? []) as unknown as EmbedRow[]) {
    const profile = Array.isArray(row.customer_profiles)
      ? row.customer_profiles[0]
      : row.customer_profiles;
    if (!profile) continue;
    const enabled = (row.customer_channels ?? []).filter(
      (c) => c.enabled === true,
    );
    if (enabled.length === 0) continue;
    out.push({ profile, channels: enabled });
  }
  return out;
}
