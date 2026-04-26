// /audit/[run_id] — finding-by-finding viewer. Print-friendly via ⌘P.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRunWithFindings } from "@/lib/audit-runs";
import { verifyAuditToken } from "@/lib/audit-token";
import { getSupabase } from "@/lib/supabase";
import type { AuditFindingRow, AuditSeverity } from "@/types/database.types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const FINDING_LABELS: Record<AuditFindingRow["finding_type"], string> = {
  claim_drift: "Claim drift",
  ingredient_mismatch: "Ingredient mismatch",
  missing_warning: "Missing warning",
};

function severityClasses(s: AuditSeverity): string {
  if (s === "high") return "bg-recall/10 text-recall border-recall/40";
  if (s === "medium") return "bg-amber-100 text-amber-900 border-amber-300";
  return "bg-ink/5 text-ink-muted border-ink/20";
}

export default async function AuditRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ run_id: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const [{ run_id }, sp] = await Promise.all([params, searchParams]);
  const token = firstParam(sp.t);
  const auth = verifyAuditToken(token);
  if (!auth) redirect("/?audit=invalid_token");

  const supabase = getSupabase();
  const result = await getRunWithFindings(supabase, run_id, auth.customerId);
  if (!result) notFound();
  const { run, findings } = result;
  const tokenQ = `?t=${encodeURIComponent(token!)}`;

  return (
    <main className="min-h-screen bg-paper text-ink print:bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16 md:py-20 print:py-8">
        <div className="mb-10 flex items-center justify-between print:hidden">
          <Link
            href={`/audit${tokenQ}`}
            className="font-display text-2xl tracking-tight text-ink hover:text-ink/70"
          >
            label<span className="text-recall">.</span>watch
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
            Audit report
          </span>
        </div>

        <header className="mb-10">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight mb-3">
            Audit · {new Date(run.run_at).toLocaleString()}
          </h1>
          {run.status === "complete" ? (
            <p className="text-ink-muted">
              {findings.length} finding{findings.length === 1 ? "" : "s"}
              {run.severity_max ? ` · max severity: ${run.severity_max}` : ""}
            </p>
          ) : run.status === "failed" ? (
            <p className="text-recall">Failed: {run.error ?? "unknown error"}</p>
          ) : (
            <p className="text-ink-muted italic">In progress — refresh in a few seconds.</p>
          )}
        </header>

        {run.status === "complete" && findings.length === 0 ? (
          <div className="border border-rule bg-ink/5 px-6 py-8 text-center">
            <p className="font-display text-2xl mb-2">No drift detected.</p>
            <p className="text-ink-muted">
              Your listing copy is consistent with the Supplement Facts Panel.
            </p>
          </div>
        ) : null}

        {findings.length > 0 ? (
          <ul className="space-y-6">
            {findings.map((f) => (
              <li key={f.id} className="border border-rule p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.2em] border px-2 py-1 ${severityClasses(f.severity)}`}
                  >
                    {f.severity}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                    {FINDING_LABELS[f.finding_type]}
                  </span>
                  {f.listing_line ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                      Listing line {f.listing_line}
                    </span>
                  ) : null}
                </div>
                <p className="font-display text-lg mb-2 leading-snug">
                  {f.excerpt}
                </p>
                {f.detail ? (
                  <p className="text-sm text-ink-muted leading-relaxed">
                    {f.detail}
                  </p>
                ) : null}
                {f.sfp_reference ? (
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                    SFP reference: {f.sfp_reference}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <footer className="mt-16 border-t border-rule pt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted print:hidden">
          ⌘P to save as PDF · Re-run anytime from the dashboard.
        </footer>
      </div>
    </main>
  );
}
