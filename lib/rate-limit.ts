// Per-customer delivery rate limiter — bead infrastructure-vlm7.
// Sliding 1-hour window using PostgREST count head (clones the
// tierQuotaCheck pattern from lib/audit-runs.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_MAX_PER_HOUR = 20;
const WINDOW_MS = 60 * 60 * 1000;

function parseLimit(): number {
  const raw = process.env.MAX_DELIVERIES_PER_CUSTOMER_PER_HOUR;
  if (!raw) return DEFAULT_MAX_PER_HOUR;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return DEFAULT_MAX_PER_HOUR;
  return n;
}

// Returns the rate-limit decision for a single customer. `limited=true`
// means the worker should defer this delivery to next hour
// (next_attempt_at = NOW() + 1h, status stays pending).
export async function checkRateLimit(
  supabase: SupabaseClient,
  customerId: string,
): Promise<{ limited: boolean; used: number; limit: number }> {
  const limit = parseLimit();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("delivery_jobs")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("status", "sent")
    .gte("sent_at", since);
  if (error) {
    throw new Error(`rate-limit query failed: ${error.message}`);
  }
  const used = count ?? 0;
  return { limited: used >= limit, used, limit };
}
