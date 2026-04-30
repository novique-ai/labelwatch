// Slack channel adapter — bead infrastructure-vlm7.
// Block Kit format with severity-colored attachment.
// Idempotency: caller (deliver.ts) handles per-job retry/DLQ; this adapter
// only reports outcomes.

import type {
  CustomerChannelRow,
  DeliveryJobRow,
  DeliveryOutcome,
  RecallRow,
} from "@/types/database.types";
import {
  buildBodyFields,
  headerText,
  severityColor,
} from "./render";

const FETCH_TIMEOUT_MS = 10_000;

export async function slackAdapter(
  job: DeliveryJobRow,
  recall: RecallRow,
  channel: CustomerChannelRow,
): Promise<DeliveryOutcome> {
  const cfg = channel.config as { webhook_url: string };
  if (!cfg?.webhook_url || !cfg.webhook_url.startsWith("https://")) {
    return {
      ok: false,
      error: "slack channel has no valid webhook_url",
      transient: false,
    };
  }

  const f = buildBodyFields(recall);
  const color = severityColor(recall.classification);
  const header = headerText(job);

  const body = {
    attachments: [
      {
        color,
        blocks: [
          { type: "header", text: { type: "plain_text", text: header } },
          {
            type: "section",
            fields: [
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
      },
    ],
  };

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(cfg.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (resp.ok) return { ok: true };
    // 401/403/404 from Slack mean the webhook URL is dead — non-transient.
    const isFatal = resp.status === 401 || resp.status === 403 || resp.status === 404;
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `slack ${resp.status}: ${text.slice(0, 200)}`,
      transient: !isFatal,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      transient: true,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
