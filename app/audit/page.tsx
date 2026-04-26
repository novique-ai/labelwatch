// /audit — token-gated dashboard. Lists past runs, links to "New audit" + each run.

import Link from "next/link";
import { redirect } from "next/navigation";
import { listRunsForCustomer } from "@/lib/audit-runs";
import { verifyAuditToken } from "@/lib/audit-token";
import { getSupabase } from "@/lib/supabase";
import type { AuditRunRow, AuditSeverity } from "@/types/database.types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function severityClasses(s: AuditSeverity | null): string {
  if (s === "high") return "bg-recall/10 text-recall border-recall/30";
  if (s === "medium") return "bg-amber-100 text-amber-900 border-amber-300";
  if (s === "low") return "bg-ink/5 text-ink-muted border-ink/20";
  return "bg-ink/5 text-ink-muted border-ink/20";
}

function StatusPill({ run }: { run: AuditRunRow }) {
  const map: Record<AuditRunRow["status"], string> = {
    pending: "Pending",
    running: "Running",
    complete: "Complete",
    failed: "Failed",
  };
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
      {map[run.status]}
    </span>
  );
}

export default async function AuditDashboard({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = firstParam(params.t);
  const auth = verifyAuditToken(token);
  if (!auth) redirect("/?audit=invalid_token");

  const supabase = getSupabase();
  const runs = await listRunsForCustomer(supabase, auth.customerId);
  const tokenQ = `?t=${encodeURIComponent(token!)}`;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-4xl px-6 py-16 md:py-20">
        <div className="mb-10 flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-2xl tracking-tight text-ink hover:text-ink/70"
          >
            label<span className="text-recall">.</span>watch
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
            Listing Copy Audit
          </span>
        </div>

        <header className="mb-10">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight mb-3">
            Audits
          </h1>
          <p className="text-ink-muted max-w-prose">
            Diff your Supplement Facts Panel against your Amazon or brand-site
            listing copy. Findings rank by severity — high-severity items
            reference disease/treatment claims and should be removed before
            Amazon's TIC scan picks them up.
          </p>
        </header>

        <div className="mb-8">
          <Link
            href={`/audit/new${tokenQ}`}
            className="inline-block bg-ink text-paper font-mono text-xs uppercase tracking-[0.2em] px-5 py-3 hover:bg-ink/85"
          >
            New audit →
          </Link>
        </div>

        {runs.length === 0 ? (
          <p className="text-ink-muted italic">
            No audits yet. Run your first one to see findings here.
          </p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {runs.map((run) => (
              <li key={run.id} className="py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <Link
                      href={`/audit/${run.id}${tokenQ}`}
                      className="font-display text-lg text-ink hover:text-recall"
                    >
                      {new Date(run.run_at).toLocaleString()}
                    </Link>
                    <StatusPill run={run} />
                  </div>
                  <div className="text-sm text-ink-muted">
                    {run.status === "complete" ? (
                      <>
                        {run.finding_count} finding{run.finding_count === 1 ? "" : "s"}
                        {run.severity_max ? ` · max severity: ${run.severity_max}` : ""}
                      </>
                    ) : run.status === "failed" ? (
                      <span className="text-recall">{run.error ?? "Failed"}</span>
                    ) : (
                      "In progress…"
                    )}
                  </div>
                </div>
                {run.severity_max ? (
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.2em] border px-2 py-1 ${severityClasses(run.severity_max)}`}
                  >
                    {run.severity_max}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-16 border-t border-rule pt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
          Bookmark this URL — it's your private access link.
        </footer>
      </div>
    </main>
  );
}
