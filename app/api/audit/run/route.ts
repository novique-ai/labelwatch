// POST /api/audit/run — multipart form: sfp_image (File), listing_text (string).
// Auth: ?t=<token> (signed audit-access token). Returns { ok, run_id }.
//
// Flow: validate token → tier-quota → upload SFP → create pending run → run
// extract+diff inline → complete run with findings (or fail).
// Inline orchestration fits in Vercel function timeout for typical SFP+listing.

import { NextResponse } from "next/server";
import { extractListing, extractSfpFromImage } from "@/lib/audit-extract";
import { diffSfpVsListing, summarizeFindings } from "@/lib/audit-diff";
import {
  completeRun,
  createRunPending,
  failRun,
  markRunRunning,
  tierQuotaCheck,
} from "@/lib/audit-runs";
import {
  isAllowedSfpMime,
  isAllowedSfpSize,
  uploadSfpImage,
} from "@/lib/audit-storage";
import { verifyAuditToken } from "@/lib/audit-token";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_LISTING_CHARS = 50_000;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const auth = verifyAuditToken(token);
  if (!auth) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }

  const file = form.get("sfp_image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_sfp_image" }, { status: 400 });
  }
  if (!isAllowedSfpMime(file.type)) {
    return NextResponse.json(
      { error: "unsupported_image_type", allowed: ["image/png", "image/jpeg"] },
      { status: 400 },
    );
  }
  if (!isAllowedSfpSize(file.size)) {
    return NextResponse.json({ error: "image_too_large" }, { status: 413 });
  }

  const listingText = String(form.get("listing_text") ?? "").trim();
  if (listingText.length < 50) {
    return NextResponse.json({ error: "listing_text_too_short" }, { status: 400 });
  }
  if (listingText.length > MAX_LISTING_CHARS) {
    return NextResponse.json({ error: "listing_text_too_long" }, { status: 413 });
  }

  const supabase = getSupabase();

  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("id, tier, onboarding_completed_at")
    .eq("id", auth.customerId)
    .single();
  if (customerErr || !customer || !customer.onboarding_completed_at) {
    return NextResponse.json({ error: "customer_not_eligible" }, { status: 403 });
  }

  const quota = await tierQuotaCheck(supabase, customer.id, customer.tier);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "quota_exceeded", limit: quota.limit, used: quota.used },
      { status: 429 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Use a transient ID for the storage path; we'll insert the row right after
  // and store the same path on it. (Keeps the upload path stable across retries.)
  const tempRunId = crypto.randomUUID();
  let storagePath: string;
  try {
    storagePath = await uploadSfpImage(
      supabase,
      customer.id,
      tempRunId,
      bytes,
      file.type,
    );
  } catch (err) {
    return NextResponse.json(
      { error: "sfp_upload_failed", detail: (err as Error).message },
      { status: 500 },
    );
  }

  const runId = await createRunPending(
    supabase,
    customer.id,
    storagePath,
    listingText,
  );

  try {
    await markRunRunning(supabase, runId);
    const [sfpExtract, listingExtract] = await Promise.all([
      extractSfpFromImage(bytes, file.type),
      extractListing(listingText),
    ]);
    const findings = diffSfpVsListing(sfpExtract, listingExtract);
    const { severityMax } = summarizeFindings(findings);
    await completeRun(supabase, runId, sfpExtract, listingExtract, findings, severityMax);
    return NextResponse.json({
      ok: true,
      run_id: runId,
      finding_count: findings.length,
      severity_max: severityMax,
    });
  } catch (err) {
    const message = (err as Error).message ?? "audit failed";
    console.error("audit run failed", runId, message);
    await failRun(supabase, runId, message).catch(() => undefined);
    return NextResponse.json(
      { error: "audit_failed", detail: message, run_id: runId },
      { status: 500 },
    );
  }
}
