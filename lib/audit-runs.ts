// DB helpers for audit_runs + audit_findings.
// - tierQuotaCheck: enforce 1 / 10 / unlimited per 30 days.
// - createRunPending → markRunning → completeRun / failRun lifecycle.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditFindingRow,
  AuditRunRow,
  AuditSeverity,
  ListingExtract,
  SfpExtract,
  Tier,
} from "@/types/database.types";
import type { DiffFinding } from "./audit-diff";

const TIER_QUOTA: Record<Tier, number | null> = {
  starter: 1,
  pro: 10,
  team: null, // unlimited
};
const QUOTA_WINDOW_MS = 30 * 24 * 3600 * 1000;

export async function tierQuotaCheck(
  supabase: SupabaseClient,
  customerId: string,
  tier: Tier,
): Promise<{ allowed: true } | { allowed: false; limit: number; used: number }> {
  const limit = TIER_QUOTA[tier];
  if (limit === null) return { allowed: true };
  const since = new Date(Date.now() - QUOTA_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("audit_runs")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .in("status", ["running", "complete"])
    .gte("run_at", since);
  if (error) {
    throw new Error(`audit_runs quota query failed: ${error.message}`);
  }
  const used = count ?? 0;
  if (used >= limit) return { allowed: false, limit, used };
  return { allowed: true };
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function createRunPending(
  supabase: SupabaseClient,
  customerId: string,
  sfpStoragePath: string,
  listingText: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("audit_runs")
    .insert({
      customer_id: customerId,
      sfp_storage_path: sfpStoragePath,
      listing_text: listingText,
      listing_text_sha256: sha256Hex(listingText),
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`audit_runs insert failed: ${error?.message ?? "no row"}`);
  }
  return data.id;
}

export async function markRunRunning(
  supabase: SupabaseClient,
  runId: string,
): Promise<void> {
  const { error } = await supabase
    .from("audit_runs")
    .update({ status: "running" })
    .eq("id", runId);
  if (error) throw new Error(`mark running failed: ${error.message}`);
}

export async function completeRun(
  supabase: SupabaseClient,
  runId: string,
  sfp: SfpExtract,
  listing: ListingExtract,
  findings: DiffFinding[],
  severityMax: AuditSeverity | null,
): Promise<void> {
  const { error: runErr } = await supabase
    .from("audit_runs")
    .update({
      status: "complete",
      finding_count: findings.length,
      severity_max: severityMax,
      sfp_extract: sfp,
      listing_extract: listing,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (runErr) throw new Error(`complete run failed: ${runErr.message}`);
  if (findings.length === 0) return;
  const rows = findings.map((f) => ({ run_id: runId, ...f }));
  const { error: findErr } = await supabase.from("audit_findings").insert(rows);
  if (findErr) throw new Error(`findings insert failed: ${findErr.message}`);
}

export async function failRun(
  supabase: SupabaseClient,
  runId: string,
  message: string,
): Promise<void> {
  await supabase
    .from("audit_runs")
    .update({
      status: "failed",
      error: message.slice(0, 1000),
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

export async function listRunsForCustomer(
  supabase: SupabaseClient,
  customerId: string,
  limit = 25,
): Promise<AuditRunRow[]> {
  const { data, error } = await supabase
    .from("audit_runs")
    .select(
      "id, customer_id, sfp_storage_path, listing_text, listing_text_sha256, status, error, finding_count, severity_max, sfp_extract, listing_extract, run_at, completed_at",
    )
    .eq("customer_id", customerId)
    .order("run_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`list runs failed: ${error.message}`);
  return (data ?? []) as AuditRunRow[];
}

export async function getRunWithFindings(
  supabase: SupabaseClient,
  runId: string,
  customerId: string,
): Promise<{ run: AuditRunRow; findings: AuditFindingRow[] } | null> {
  const { data: run, error: runErr } = await supabase
    .from("audit_runs")
    .select(
      "id, customer_id, sfp_storage_path, listing_text, listing_text_sha256, status, error, finding_count, severity_max, sfp_extract, listing_extract, run_at, completed_at",
    )
    .eq("id", runId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (runErr) throw new Error(`get run failed: ${runErr.message}`);
  if (!run) return null;
  const { data: findings, error: findErr } = await supabase
    .from("audit_findings")
    .select("id, run_id, finding_type, severity, excerpt, detail, sfp_reference, listing_line, created_at")
    .eq("run_id", runId)
    .order("severity", { ascending: false })
    .order("created_at", { ascending: true });
  if (findErr) throw new Error(`get findings failed: ${findErr.message}`);
  return {
    run: run as AuditRunRow,
    findings: (findings ?? []) as AuditFindingRow[],
  };
}
