// Email channel adapter — bead infrastructure-vlm7.
// Wraps lib/resend.ts. Class I recalls get URGENT_HEADERS; II/III plain.

import type {
  CustomerChannelRow,
  DeliveryJobRow,
  DeliveryOutcome,
  RecallRow,
} from "@/types/database.types";
import { sendEmail, URGENT_HEADERS } from "@/lib/resend";
import { buildBodyFields, headerText } from "./render";

const FROM_DEFAULT = "LabelWatch <alerts@label.watch>";

export async function emailAdapter(
  job: DeliveryJobRow,
  recall: RecallRow,
  channel: CustomerChannelRow,
): Promise<DeliveryOutcome> {
  const cfg = channel.config as { address: string };
  if (!cfg?.address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.address)) {
    return {
      ok: false,
      error: "email channel has no valid address",
      transient: false,
    };
  }

  const f = buildBodyFields(recall);
  const header = headerText(job);
  const isClassI = recall.classification === "Class I";
  const subject = `[${f.classification}] Recall — ${f.firm_name_raw}`;

  const text = [
    header,
    "",
    `Classification: ${f.classification}`,
    `Firm: ${f.firm_name_raw}`,
    `Product: ${f.product_description}`,
    `Reason: ${f.reason_for_recall}`,
    `Initiated: ${f.recall_initiation_date}`,
    `Recall #: ${f.recall_number}`,
    "",
    `FDA source: ${f.fda_url}`,
  ].join("\n");

  const html = `
<div style="font-family: system-ui, sans-serif; max-width: 600px; line-height: 1.5;">
  <h2 style="margin: 0 0 16px; font-size: 18px;">${escapeHtml(header)}</h2>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <tr><td style="padding: 4px 8px 4px 0; color: #666; vertical-align: top;"><b>Classification</b></td><td style="padding: 4px 0;">${escapeHtml(f.classification)}</td></tr>
    <tr><td style="padding: 4px 8px 4px 0; color: #666; vertical-align: top;"><b>Firm</b></td><td style="padding: 4px 0;">${escapeHtml(f.firm_name_raw)}</td></tr>
    <tr><td style="padding: 4px 8px 4px 0; color: #666; vertical-align: top;"><b>Product</b></td><td style="padding: 4px 0;">${escapeHtml(f.product_description)}</td></tr>
    <tr><td style="padding: 4px 8px 4px 0; color: #666; vertical-align: top;"><b>Reason</b></td><td style="padding: 4px 0;">${escapeHtml(f.reason_for_recall)}</td></tr>
    <tr><td style="padding: 4px 8px 4px 0; color: #666; vertical-align: top;"><b>Initiated</b></td><td style="padding: 4px 0;">${escapeHtml(f.recall_initiation_date)}</td></tr>
    <tr><td style="padding: 4px 8px 4px 0; color: #666; vertical-align: top;"><b>Recall #</b></td><td style="padding: 4px 0; font-family: monospace; font-size: 12px;">${escapeHtml(f.recall_number)}</td></tr>
  </table>
  <p style="margin: 24px 0 0; font-size: 13px;">
    <a href="${escapeHtmlAttr(f.fda_url)}" style="color: #c63a1f; text-decoration: underline;">View on FDA →</a>
  </p>
</div>`.trim();

  let result: { ok: true; id: string } | { ok: false; error: string };
  try {
    result = await sendEmail({
      from: FROM_DEFAULT,
      to: cfg.address,
      subject,
      text,
      html,
      headers: isClassI ? URGENT_HEADERS : undefined,
    });
  } catch (err) {
    // sendEmail throws on network errors (uncaught fetch). Treat as transient.
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      transient: true,
    };
  }

  if (!result.ok) {
    // Resend API errors (incl. 429). Treat all as transient — Resend doesn't
    // give us a status code in the error string. If it's an auth issue
    // ("invalid api key"), it'll dead-letter at MAX_ATTEMPTS=5 anyway.
    return { ok: false, error: result.error, transient: true };
  }
  return { ok: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(s: string): string {
  return escapeHtml(s);
}
