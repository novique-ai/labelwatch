// Generic HTTP webhook adapter — bead infrastructure-vlm7.
// POSTs canonical JSON body with HMAC-SHA256 signature header
// (X-LabelWatch-Signature: sha256=<hex>) using customer-specific signing_secret
// stored in customer_channels.config (HttpChannelConfig).
//
// Customer verifies on their end:
//   const expected = "sha256=" + crypto.createHmac("sha256", secret)
//                                       .update(rawBody, "utf8").digest("hex");
//   if (expected !== req.headers["x-labelwatch-signature"]) reject;
//
// Note on canonical body: we use plain JSON.stringify(payload) — no key
// sorting. The customer reconstructs by reading the raw request body string
// before any JSON.parse. The serialized string (not the parsed object) is
// what's signed. We document this in /onboard/complete display copy.

import { createHmac, randomBytes } from "node:crypto";
import type {
  CustomerChannelRow,
  DeliveryJobRow,
  DeliveryOutcome,
  HttpChannelConfig,
  RecallRow,
} from "@/types/database.types";

const FETCH_TIMEOUT_MS = 10_000;

export type WebhookPayload = {
  delivery_id: string;
  recall: {
    id: string;
    recall_number: string;
    classification: string | null;
    firm_name_raw: string;
    product_description: string | null;
    reason_for_recall: string | null;
    recall_initiation_date: string | null;
  };
  match: {
    reason: "firm_alias" | "ingredient_category";
    value: string;
  };
  severity_class: string;
  delivered_at: string; // ISO 8601
};

// Generate a signing secret for a new HTTP channel: 32 bytes, hex-encoded
// (64 chars). Used by /api/onboard for first-time http-channel onboards.
export function generateSigningSecret(): string {
  return randomBytes(32).toString("hex");
}

// Compute the X-LabelWatch-Signature header value.
export function signPayload(secret: string, body: string): string {
  const hmac = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${hmac}`;
}

export function buildWebhookPayload(
  job: DeliveryJobRow,
  recall: RecallRow,
): WebhookPayload {
  return {
    delivery_id: job.id,
    recall: {
      id: recall.id,
      recall_number: recall.recall_number,
      classification: recall.classification,
      firm_name_raw: recall.firm_name_raw,
      product_description: recall.product_description,
      reason_for_recall: recall.reason_for_recall,
      recall_initiation_date: recall.recall_initiation_date,
    },
    match: {
      reason: job.match_reason,
      value: job.matched_value,
    },
    severity_class: job.severity_class,
    delivered_at: new Date().toISOString(),
  };
}

export async function httpAdapter(
  job: DeliveryJobRow,
  recall: RecallRow,
  channel: CustomerChannelRow,
): Promise<DeliveryOutcome> {
  const cfg = channel.config as HttpChannelConfig;
  if (!cfg?.url || !cfg.url.startsWith("https://")) {
    return {
      ok: false,
      error: "http channel has no valid url",
      transient: false,
    };
  }
  if (!cfg.signing_secret || cfg.signing_secret.length !== 64) {
    return {
      ok: false,
      error: "http channel missing signing_secret (re-onboard required)",
      transient: false,
    };
  }

  const payload = buildWebhookPayload(job, recall);
  const body = JSON.stringify(payload);
  const signature = signPayload(cfg.signing_secret, body);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-LabelWatch-Signature": signature,
    "X-LabelWatch-Delivery-Id": job.id,
  };
  if (cfg.auth_header) headers["Authorization"] = cfg.auth_header;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(cfg.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    if (resp.ok) return { ok: true };
    // 401/403 = signed-wrong or auth-bad; 404 = endpoint moved.
    // Retrying won't help — non-transient.
    const isFatal = resp.status === 401 || resp.status === 403 || resp.status === 404;
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      error: `http ${resp.status}: ${text.slice(0, 200)}`,
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
