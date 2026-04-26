"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ACCEPT = "image/png,image/jpeg";
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_LISTING_CHARS = 50;

type ErrorCode =
  | "invalid_token"
  | "unsupported_image_type"
  | "image_too_large"
  | "missing_sfp_image"
  | "listing_text_too_short"
  | "listing_text_too_long"
  | "customer_not_eligible"
  | "quota_exceeded"
  | "sfp_upload_failed"
  | "audit_failed"
  | "client";

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  invalid_token: "Your access link is invalid or expired. Reply to your welcome email and we'll reissue.",
  unsupported_image_type: "SFP image must be PNG or JPEG.",
  image_too_large: "SFP image is over 10MB — please compress and retry.",
  missing_sfp_image: "Pick an SFP image to upload.",
  listing_text_too_short: "Paste more listing copy — at least a few sentences.",
  listing_text_too_long: "Listing copy is over 50,000 characters. Trim and retry.",
  customer_not_eligible: "Your account isn't fully onboarded yet. Contact support@novique.ai.",
  quota_exceeded: "You've used your audits for this 30-day window. Upgrade to run more.",
  sfp_upload_failed: "Couldn't store your SFP image. Retry; if it persists, contact support.",
  audit_failed: "The audit run failed mid-flight. Retry; if it persists, contact support.",
  client: "Something went wrong submitting the form. Retry, or contact support.",
};

export default function AuditNewForm({ token }: { token: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [listingText, setListingText] = useState("");
  const [error, setError] = useState<ErrorCode | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function clientValidate(): ErrorCode | null {
    if (!file) return "missing_sfp_image";
    if (!ACCEPT.split(",").includes(file.type)) return "unsupported_image_type";
    if (file.size <= 0 || file.size > MAX_BYTES) return "image_too_large";
    if (listingText.trim().length < MIN_LISTING_CHARS) return "listing_text_too_short";
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const clientErr = clientValidate();
    if (clientErr) {
      setError(clientErr);
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("sfp_image", file!);
      fd.append("listing_text", listingText.trim());
      const resp = await fetch(`/api/audit/run?t=${encodeURIComponent(token)}`, {
        method: "POST",
        body: fd,
      });
      const json = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        run_id?: string;
        error?: string;
      };
      if (!resp.ok || !json.ok || !json.run_id) {
        const code = (json.error as ErrorCode) ?? "client";
        setError(code in ERROR_MESSAGES ? code : "client");
        setSubmitting(false);
        return;
      }
      router.push(`/audit/${json.run_id}?t=${encodeURIComponent(token)}`);
    } catch (err) {
      console.error(err);
      setError("client");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
          1 — Supplement Facts Panel image
        </label>
        <input
          type="file"
          accept={ACCEPT}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={submitting}
          className="block w-full text-sm file:mr-4 file:px-4 file:py-2 file:border file:border-rule file:bg-paper file:font-mono file:text-[10px] file:uppercase file:tracking-[0.2em] file:text-ink hover:file:bg-ink/5"
        />
        <p className="mt-2 text-xs text-ink-muted">
          PNG or JPEG, max 10MB. Crop to just the SFP for best results.
        </p>
      </div>

      <div>
        <label className="block font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted mb-2">
          2 — Listing copy (paste)
        </label>
        <textarea
          value={listingText}
          onChange={(e) => setListingText(e.target.value)}
          disabled={submitting}
          placeholder="Paste your Amazon A+ content, product detail copy, or brand-site listing prose here…"
          rows={14}
          className="w-full border border-rule bg-paper px-4 py-3 text-sm font-mono leading-relaxed text-ink focus:outline-none focus:border-ink"
        />
        <p className="mt-2 text-xs text-ink-muted">
          Plain text or HTML. We tokenize claims and ingredient mentions by
          line; line numbers in the report match what you pasted.
        </p>
      </div>

      {error ? (
        <div className="border border-recall/40 bg-recall/5 text-recall px-4 py-3 text-sm">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="bg-ink text-paper font-mono text-xs uppercase tracking-[0.2em] px-6 py-3 hover:bg-ink/85 disabled:opacity-60"
      >
        {submitting ? "Running audit…" : "Run audit"}
      </button>
    </form>
  );
}
