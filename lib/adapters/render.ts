// Pure rendering helpers for the 4 delivery adapters — bead infrastructure-vlm7.
// Digest multi-recall render helpers added in bead infrastructure-xzuz.
// No I/O. Tests live in render.test.ts. All adapters import from here.

import type {
  DeliveryJobRow,
  RecallClassification,
  RecallRow,
} from "@/types/database.types";

// Severity → color map. Locked.
//   Class I   → red    (immediate health hazard)
//   Class II  → orange (temporary or medically-reversible)
//   Class III → yellow (label issue, no health hazard)
export const SEVERITY_COLORS: Record<RecallClassification, string> = {
  "Class I": "#c63a1f",
  "Class II": "#ec8800",
  "Class III": "#d4a017",
};

export function severityColor(classification: RecallClassification | null): string {
  if (!classification) return "#888888";
  return SEVERITY_COLORS[classification] ?? "#888888";
}

// Header copy is driven by match_reason:
//   firm_alias          → "🚨 <ALIAS> RECALLED" (your firm)
//   ingredient_category → "ℹ️ Peer recall in your <category> category"
export function headerText(job: DeliveryJobRow): string {
  if (job.match_reason === "firm_alias") {
    return `🚨 ${job.matched_value.toUpperCase()} RECALLED`;
  }
  return `ℹ️ Peer recall in your ${job.matched_value} category`;
}

// Body field bundle, NULL-safe. All adapters render the same fields.
export type BodyFields = {
  classification: string;
  firm_name_raw: string;
  product_description: string;
  reason_for_recall: string;
  recall_initiation_date: string;
  recall_number: string;
  fda_url: string;
};

export function buildBodyFields(recall: RecallRow): BodyFields {
  return {
    classification: recall.classification ?? "Unknown",
    firm_name_raw: recall.firm_name_raw,
    product_description: recall.product_description ?? "N/A",
    reason_for_recall: recall.reason_for_recall ?? "N/A",
    recall_initiation_date: recall.recall_initiation_date ?? "N/A",
    recall_number: recall.recall_number,
    // Link to openFDA's enforcement-record API URL filtered to this recall.
    // Until we ship a labelwatch detail page, this is the canonical source.
    fda_url: `https://api.fda.gov/food/enforcement.json?search=recall_number:%22${encodeURIComponent(recall.recall_number)}%22`,
  };
}

// Backoff schedule. attempts = the value AFTER incrementing on this
// attempt (1 = first retry, 2 = second, ...). attempts >= 5 should never
// reach this function — settleJob() dead-letters before the call.
//
// Sequence: 1m → 5m → 15m → 1h. Max time-to-DLQ ≈ 1h21m.
const BACKOFF_MS = [
  1 * 60_000,    // attempt 1 → +1m
  5 * 60_000,    // attempt 2 → +5m
  15 * 60_000,   // attempt 3 → +15m
  60 * 60_000,   // attempt 4 → +1h
] as const;

export function nextAttemptAt(attempts: number): Date {
  // Defensive clamp: out-of-range inputs use the longest backoff. The
  // caller should have already dead-lettered for attempts >= 5.
  const idx = Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1);
  return new Date(Date.now() + BACKOFF_MS[idx]);
}

// Number of attempts after which a realtime job is dead-lettered.
export const MAX_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Digest render helpers — bead infrastructure-xzuz.
// Called by lib/digest.ts; NOT called by the per-job adapter files.
// Produces one multi-recall Slack post / email per (customer × channel) bundle.
// ---------------------------------------------------------------------------

export type DigestRecall = {
  job: DeliveryJobRow;
  recall: RecallRow;
};

// Slack Block Kit body for a digest bundle. One color-coded attachment per
// recall, stacked. Top-level `text` is the notification fallback.
export function buildDigestSlackBody(items: DigestRecall[]): unknown {
  const date = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const fallback = `FDA Recall Digest — ${items.length} match${items.length === 1 ? "" : "es"} · ${date}`;

  const attachments = items.map(({ job, recall }) => {
    const f = buildBodyFields(recall);
    return {
      color: severityColor(recall.classification),
      blocks: [
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*${headerText(job)}*` },
            { type: "mrkdwn", text: `*Classification:*\n${f.classification}` },
            { type: "mrkdwn", text: `*Firm:*\n${f.firm_name_raw}` },
            { type: "mrkdwn", text: `*Product:*\n${f.product_description}` },
            { type: "mrkdwn", text: `*Reason:*\n${f.reason_for_recall}` },
            { type: "mrkdwn", text: `*Initiated:*\n${f.recall_initiation_date}` },
            { type: "mrkdwn", text: `*Recall #:*\n${f.recall_number}` },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View on FDA →" },
              url: f.fda_url,
            },
          ],
        },
      ],
    };
  });

  return { text: fallback, attachments };
}

// Plain-text body for a digest email.
export function buildDigestEmailText(items: DigestRecall[]): string {
  const date = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const lines = [
    `FDA Recall Digest — ${date}`,
    `${items.length} match${items.length === 1 ? "" : "es"}`,
    "",
  ];
  for (const { job, recall } of items) {
    const f = buildBodyFields(recall);
    lines.push(
      `--- ${headerText(job)} ---`,
      `Classification: ${f.classification}`,
      `Firm: ${f.firm_name_raw}`,
      `Product: ${f.product_description}`,
      `Reason: ${f.reason_for_recall}`,
      `Initiated: ${f.recall_initiation_date}`,
      `Recall #: ${f.recall_number}`,
      `FDA source: ${f.fda_url}`,
      "",
    );
  }
  return lines.join("\n");
}

// HTML body for a digest email. One recall card per item, separated by a
// severity-colored top border. Class I in any item triggers URGENT_HEADERS
// on the send (handled by the caller in lib/digest.ts).
export function buildDigestEmailHtml(items: DigestRecall[]): string {
  const date = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const title = escapeHtml(`FDA Recall Digest — ${date}`);
  const countLine = escapeHtml(
    `${items.length} match${items.length === 1 ? "" : "es"}`,
  );

  const cards = items
    .map(({ job, recall }) => {
      const f = buildBodyFields(recall);
      const color = escapeHtmlAttr(severityColor(recall.classification));
      return `<div style="border-top: 2px solid ${color}; padding: 16px 0; margin: 16px 0;">
  <h3 style="margin: 0 0 12px; font-size: 15px;">${escapeHtml(headerText(job))}</h3>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <tr><td style="padding: 3px 8px 3px 0; color: #666; vertical-align: top;"><b>Classification</b></td><td style="padding: 3px 0;">${escapeHtml(f.classification)}</td></tr>
    <tr><td style="padding: 3px 8px 3px 0; color: #666; vertical-align: top;"><b>Firm</b></td><td style="padding: 3px 0;">${escapeHtml(f.firm_name_raw)}</td></tr>
    <tr><td style="padding: 3px 8px 3px 0; color: #666; vertical-align: top;"><b>Product</b></td><td style="padding: 3px 0;">${escapeHtml(f.product_description)}</td></tr>
    <tr><td style="padding: 3px 8px 3px 0; color: #666; vertical-align: top;"><b>Reason</b></td><td style="padding: 3px 0;">${escapeHtml(f.reason_for_recall)}</td></tr>
    <tr><td style="padding: 3px 8px 3px 0; color: #666; vertical-align: top;"><b>Initiated</b></td><td style="padding: 3px 0;">${escapeHtml(f.recall_initiation_date)}</td></tr>
    <tr><td style="padding: 3px 8px 3px 0; color: #666; vertical-align: top;"><b>Recall #</b></td><td style="padding: 3px 0; font-family: monospace; font-size: 12px;">${escapeHtml(f.recall_number)}</td></tr>
  </table>
  <p style="margin: 10px 0 0; font-size: 13px;">
    <a href="${escapeHtmlAttr(f.fda_url)}" style="color: #c63a1f; text-decoration: underline;">View on FDA →</a>
  </p>
</div>`;
    })
    .join("\n");

  return `<div style="font-family: system-ui, sans-serif; max-width: 600px; line-height: 1.5;">
  <h2 style="margin: 0 0 4px; font-size: 18px;">${title}</h2>
  <p style="margin: 0 0 16px; font-size: 13px; color: #666;">${countLine}</p>
  ${cards}
</div>`.trim();
}

// Exported so adapters and digest.ts share one copy instead of each
// defining a private version.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeHtmlAttr(s: string): string {
  return escapeHtml(s);
}
