// Pure helpers for /account recent-matches list.
// Delivery jobs are one row per channel; the dashboard should show one
// row per recall so operators aren't flooded with duplicates.

export type DashboardMatchInput = {
  id: string;
  status: string;
  severity_class: string;
  matched_value: string;
  sent_at: string | null;
  created_at: string;
  recall_id?: string | null;
  recall: {
    recall_number: string;
    firm_name_raw: string;
    product_description: string | null;
  } | null;
};

export type DashboardMatchRow = DashboardMatchInput & {
  /** Distinct channels that received this recall (for display). */
  channel_count: number;
  /** Aggregated status across channel deliveries. */
  display_status: string;
};

const SYNTHETIC_FIRM_RE = /^Synthetic Test Manufacturer/i;
const SYNTHETIC_RECALL_RE = /^SYN-/i;

export function isSyntheticMatch(row: DashboardMatchInput): boolean {
  const firm = row.recall?.firm_name_raw ?? "";
  const num = row.recall?.recall_number ?? "";
  return SYNTHETIC_FIRM_RE.test(firm) || SYNTHETIC_RECALL_RE.test(num);
}

function aggregateStatus(statuses: string[]): string {
  if (statuses.includes("sent")) return "sent";
  if (statuses.includes("digest_pending")) return "digest_pending";
  if (statuses.includes("pending") || statuses.includes("delivering")) {
    return "pending";
  }
  if (statuses.every((s) => s === "dead_letter")) return "dead_letter";
  return statuses[0] ?? "unknown";
}

/**
 * Collapse per-channel delivery_jobs into one dashboard row per recall.
 * Input should already be newest-first. Returns up to `limit` unique recalls.
 */
export function dedupeMatchesByRecall(
  rows: DashboardMatchInput[],
  limit = 20,
): DashboardMatchRow[] {
  const order: string[] = [];
  const byKey = new Map<
    string,
    {
      row: DashboardMatchInput;
      statuses: string[];
      channel_count: number;
    }
  >();

  for (const row of rows) {
    if (isSyntheticMatch(row)) continue;
    const key =
      row.recall_id ||
      row.recall?.recall_number ||
      // fallback: firm+product+day when join is missing
      `${row.recall?.firm_name_raw ?? ""}|${row.recall?.product_description ?? ""}|${row.created_at.slice(0, 10)}`;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { row, statuses: [row.status], channel_count: 1 });
      order.push(key);
    } else {
      existing.channel_count += 1;
      existing.statuses.push(row.status);
    }
  }

  const out: DashboardMatchRow[] = [];
  for (const key of order) {
    if (out.length >= limit) break;
    const entry = byKey.get(key)!;
    const display_status = aggregateStatus(entry.statuses);
    out.push({
      ...entry.row,
      status: display_status,
      channel_count: entry.channel_count,
      display_status,
    });
  }
  return out;
}

/** Slack/Teams webhook destination for UI — hide the secret token segment. */
export function redactWebhookDestination(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    // https://hooks.slack.com/services/T…/B…/SECRET → hide last path segment
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 3) {
      const redacted = parts
        .map((p, i) => (i === parts.length - 1 ? "••••••••" : p))
        .join("/");
      return `${u.origin}/${redacted}`;
    }
  } catch {
    // fall through
  }
  if (url.length > 48) return `${url.slice(0, 36)}…`;
  return url;
}

export function isInactiveSubscriptionStatus(status: string): boolean {
  return (
    status === "canceled" ||
    status === "cancelled" ||
    status === "unpaid" ||
    status === "incomplete_expired"
  );
}
