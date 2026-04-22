// openFDA food/enforcement poller.
// Fetches recent dietary-supplement recalls, upserts into public.recalls,
// resolves canonical firms on the way. Idempotent: upserts on recall_number.
//
// Scheduler: UptimeRobot hits /api/cron/poll every 5 minutes.
// Window: we re-fetch the last 30 days on every poll. openFDA publishes
// infrequently (< 100 food recalls per year in the supplement bucket), so
// 30-day re-scan is cheap and guarantees we catch late FDA status changes.

import { getSupabase } from "./supabase";
import { findOrCreateFirm } from "./firms";

const OPENFDA_URL = "https://api.fda.gov/food/enforcement.json";
const SUPPLEMENT_SEARCH = `product_description:"dietary+supplement"`;
const DEFAULT_POLL_WINDOW_DAYS = 30;
const PAGE_SIZE = 100; // openFDA max per request
const DEFAULT_MAX_PAGES = 10; // 1000 records per poll — plenty for 5-min cadence

export type PollOptions = {
  // How far back to re-fetch. Default 30d for the 5-min cron; use ~540 for
  // backfill to seed Pro tier's 12-month window plus buffer.
  windowDays?: number;
  // Hard cap on pages fetched in one run. Raise for backfill.
  maxPages?: number;
};

export type PollResult = {
  scanned: number;
  inserted: number;
  updated: number;
  newFirms: number;
  pages: number;
  durationMs: number;
};

type OpenFDARecord = {
  recall_number: string;
  recalling_firm: string;
  product_description?: string;
  reason_for_recall?: string;
  classification?: string;
  status?: string;
  recall_initiation_date?: string;
  report_date?: string;
  [key: string]: unknown;
};

export async function runPoll(options: PollOptions = {}): Promise<PollResult> {
  const windowDays = options.windowDays ?? DEFAULT_POLL_WINDOW_DAYS;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const started = Date.now();
  const startedIso = new Date(started).toISOString();
  const supabase = getSupabase();

  const { data: runRow, error: runInsertError } = await supabase
    .from("poller_runs")
    .insert({ status: "running" })
    .select("id")
    .single();
  if (runInsertError || !runRow) {
    throw new Error(`poller_runs insert failed: ${runInsertError?.message}`);
  }
  const runId = runRow.id;

  let scanned = 0;
  let inserted = 0;
  let updated = 0;
  let newFirms = 0;
  let pages = 0;

  try {
    const since = daysAgo(windowDays);
    const dateFilter = `report_date:[${since}+TO+${yyyymmdd(new Date())}]`;
    const search = `${SUPPLEMENT_SEARCH}+AND+${dateFilter}`;

    for (let skip = 0; skip < PAGE_SIZE * maxPages; skip += PAGE_SIZE) {
      const url =
        `${OPENFDA_URL}?search=${search}` +
        `&limit=${PAGE_SIZE}&skip=${skip}` +
        `&sort=report_date:desc`;

      const resp = await fetch(url, {
        headers: { "User-Agent": "labelwatch-poller/0.1" },
        cache: "no-store",
      });
      // 404 from openFDA means "no results for this query" — not an error.
      if (resp.status === 404) break;
      if (!resp.ok) {
        throw new Error(`openFDA ${resp.status}: ${await resp.text()}`);
      }

      const data = (await resp.json()) as { results?: OpenFDARecord[] };
      const results = data.results ?? [];
      if (results.length === 0) break;

      pages += 1;
      scanned += results.length;

      for (const rec of results) {
        if (!rec.recall_number || !rec.recalling_firm) continue;

        const firm = await findOrCreateFirm(supabase, rec.recalling_firm);
        if (firm.wasCreated) newFirms += 1;

        const payload = {
          recall_number: rec.recall_number,
          firm_id: firm.firmId,
          firm_name_raw: rec.recalling_firm,
          product_description: rec.product_description ?? null,
          reason_for_recall: rec.reason_for_recall ?? null,
          classification: rec.classification ?? null,
          status: rec.status ?? null,
          recall_initiation_date: parseYmd(rec.recall_initiation_date),
          report_date: parseYmd(rec.report_date),
          openfda_raw: rec,
          last_updated_at: new Date().toISOString(),
        };

        const { data: upserted, error: upsertError } = await supabase
          .from("recalls")
          .upsert(payload, { onConflict: "recall_number" })
          .select("first_seen_at")
          .single();
        if (upsertError) {
          throw new Error(
            `recall upsert failed for ${rec.recall_number}: ${upsertError.message}`,
          );
        }
        // If first_seen_at (DB-generated via DEFAULT now()) is after this run
        // began, the row was inserted in this run. Otherwise it existed and we
        // just upserted over it.
        if (upserted && upserted.first_seen_at >= startedIso) {
          inserted += 1;
        } else {
          updated += 1;
        }
      }

      if (results.length < PAGE_SIZE) break;
    }

    const durationMs = Date.now() - started;
    await supabase
      .from("poller_runs")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        scanned,
        inserted,
        updated,
        new_firms: newFirms,
        duration_ms: durationMs,
      })
      .eq("id", runId);

    return { scanned, inserted, updated, newFirms, pages, durationMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("poller_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        scanned,
        inserted,
        updated,
        new_firms: newFirms,
        error_message: message,
        duration_ms: Date.now() - started,
      })
      .eq("id", runId);
    throw err;
  }
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return yyyymmdd(d);
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function parseYmd(ymd: string | undefined): string | null {
  if (!ymd || ymd.length !== 8) return null;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}
