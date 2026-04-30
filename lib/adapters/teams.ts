// MS Teams channel adapter — bead infrastructure-vlm7.
// MessageCard format for incoming-webhook connector.
// Severity color goes in `themeColor`. Body fields render as `facts`.

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

export async function teamsAdapter(
  job: DeliveryJobRow,
  recall: RecallRow,
  channel: CustomerChannelRow,
): Promise<DeliveryOutcome> {
  const cfg = channel.config as { webhook_url: string };
  if (!cfg?.webhook_url || !cfg.webhook_url.startsWith("https://")) {
    return {
      ok: false,
      error: "teams channel has no valid webhook_url",
      transient: false,
    };
  }

  const f = buildBodyFields(recall);
  const color = severityColor(recall.classification).replace("#", "");
  const header = headerText(job);

  const body = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    themeColor: color,
    summary: header,
    title: header,
    sections: [
      {
        facts: [
          { name: "Classification", value: f.classification },
          { name: "Firm", value: f.firm_name_raw },
          { name: "Product", value: f.product_description },
          { name: "Reason", value: f.reason_for_recall },
          { name: "Initiated", value: f.recall_initiation_date },
          { name: "Recall #", value: f.recall_number },
        ],
      },
    ],
    potentialAction: [
      {
        "@type": "OpenUri",
        name: "View on FDA",
        targets: [{ os: "default", uri: f.fda_url }],
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
    const isFatal = resp.status === 401 || resp.status === 403 || resp.status === 404;
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `teams ${resp.status}: ${text.slice(0, 200)}`,
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
