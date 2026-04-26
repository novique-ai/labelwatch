// /audit/new — upload form for a single audit. Token-gated.

import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyAuditToken } from "@/lib/audit-token";
import AuditNewForm from "./audit-new-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AuditNewPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = firstParam(params.t);
  const auth = verifyAuditToken(token);
  if (!auth) redirect("/?audit=invalid_token");

  const tokenQ = `?t=${encodeURIComponent(token!)}`;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
        <div className="mb-10 flex items-center justify-between">
          <Link
            href={`/audit${tokenQ}`}
            className="font-display text-2xl tracking-tight text-ink hover:text-ink/70"
          >
            label<span className="text-recall">.</span>watch
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
            New audit
          </span>
        </div>

        <header className="mb-10">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight mb-3">
            Upload + paste.
          </h1>
          <p className="text-ink-muted max-w-prose">
            Upload your Supplement Facts Panel image and paste your Amazon A+
            content or brand-site listing copy. We'll OCR the SFP, extract
            ingredient mentions and claims from your listing, and flag drift.
            Typical run: 15–30 seconds.
          </p>
        </header>

        <AuditNewForm token={token!} />

        <footer className="mt-16 border-t border-rule pt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
          Quota windows: starter 1/mo · pro 10/mo · team unlimited.
        </footer>
      </div>
    </main>
  );
}
