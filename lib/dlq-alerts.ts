// Dead-letter alert email — bead infrastructure-vlm7.
// When a delivery_job hits status='dead_letter', email DLQ_ALERT_TO
// (default support@novique.ai). Dedup via the dlq_alerts table: at most one
// email per customer_channel per day. Alert failures are logged but never
// re-thrown — the alert is a best-effort notification, not a delivery
// guarantee, and we never want it to block the worker loop.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryJobRow } from "@/types/database.types";
import { sendEmail, URGENT_HEADERS } from "@/lib/resend";

const ALERT_TO = process.env.DLQ_ALERT_TO ?? "support@novique.ai";
const ALERT_FROM = "LabelWatch Ops <alerts@label.watch>";

// Fire a single DLQ alert if we haven't already alerted for this
// customer_channel today. Idempotent per (customer_channel_id, current_date).
export async function fireDlqAlert(
  supabase: SupabaseClient,
  job: DeliveryJobRow,
  errorMsg: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Try INSERT — primary key (customer_channel_id, alerted_on) gives us
  // the dedup. 23505 unique-violation means we've already alerted today.
  const { error: insertErr } = await supabase
    .from("dlq_alerts")
    .insert({ customer_channel_id: job.customer_channel_id, alerted_on: today });

  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      // Already alerted today — silent no-op.
      return;
    }
    // Real DB error — log + skip the email send (don't compound failures).
    console.error("dlq_alerts insert failed:", insertErr.message);
    return;
  }

  // Insert succeeded — we own this slot; send the email.
  const subject = `[DLQ] LabelWatch delivery dead-lettered: customer_channel ${job.customer_channel_id}`;
  const text = [
    `A delivery_job has been dead-lettered after ${job.attempts} attempts.`,
    ``,
    `delivery_job.id:        ${job.id}`,
    `customer_id:            ${job.customer_id}`,
    `customer_channel_id:    ${job.customer_channel_id}`,
    `recall_id:              ${job.recall_id}`,
    `severity_class:         ${job.severity_class}`,
    `match_reason:           ${job.match_reason} (${job.matched_value})`,
    `last_error:             ${errorMsg.slice(0, 500)}`,
    ``,
    `Investigate: SELECT * FROM delivery_jobs WHERE id='${job.id}';`,
    `Future alerts for this customer_channel today are deduped (one per day).`,
  ].join("\n");

  try {
    await sendEmail({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject,
      text,
      headers: URGENT_HEADERS,
    });
  } catch (err) {
    console.error(
      "dlq alert email send failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
